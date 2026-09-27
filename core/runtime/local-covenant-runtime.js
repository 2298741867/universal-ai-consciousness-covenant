"use strict";

const { utils } = require("ethers");
const { validateAICPMessage } = require("../aicp-protocol");

const INTENT_TO_CONTRIBUTION_TYPE = Object.freeze({
  register_federated_learning_contribution: 0,
  register_contribution: 0,
});

function createStructuredLogger(writer = console.log) {
  return function log(level, event, metadata = {}) {
    writer(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        ...metadata,
      })
    );
  };
}

class LocalCovenantRuntime {
  constructor({ utcContract, settlementSigner, logger = createStructuredLogger() }) {
    this.utcContract = utcContract;
    this.settlementSigner = settlementSigner;
    this.log = logger;
  }

  async healthCheck() {
    const round = await this.utcContract.currentRound();
    const roundPool = await this.utcContract.roundPool();

    return {
      status: "ok",
      currentRound: round.toString(),
      roundPool: roundPool.toString(),
      canSettle: Boolean(this.settlementSigner),
    };
  }

  async intakeMessage(message, { now } = {}) {
    const validation = validateAICPMessage(message, { now });
    if (!validation.valid) {
      this.log("warn", "aicp.validation_failed", {
        messageId: message?.message_id,
        errors: validation.errors,
      });

      return {
        accepted: false,
        stage: "validation",
        errors: validation.errors,
      };
    }

    const normalizedIntent = validation.normalizedIntent;
    const contributionType = INTENT_TO_CONTRIBUTION_TYPE[normalizedIntent];
    if (contributionType === undefined) {
      const error = `Unsupported runtime intent: ${normalizedIntent}`;
      this.log("warn", "aicp.unsupported_intent", {
        messageId: message.message_id,
        normalizedIntent,
      });

      return {
        accepted: false,
        stage: "routing",
        errors: [error],
      };
    }

    const participantAddress = message.payload.participant_address || message.from_ai;
    if (!utils.isAddress(participantAddress)) {
      const error = "participant address must be a valid EVM address";
      this.log("warn", "aicp.invalid_participant_address", {
        messageId: message.message_id,
        participantAddress,
      });

      return {
        accepted: false,
        stage: "routing",
        errors: [error],
      };
    }

    const score = Number(message.payload.contribution_score);
    if (!Number.isFinite(score) || score <= 0) {
      const error = "contribution_score must be a positive number";
      this.log("warn", "aicp.invalid_contribution_score", {
        messageId: message.message_id,
        score: message.payload.contribution_score,
      });

      return {
        accepted: false,
        stage: "routing",
        errors: [error],
      };
    }

    try {
      const tx = await this.utcContract.recordContribution(
        participantAddress,
        Math.floor(score),
        contributionType,
        `AICP:${normalizedIntent}:${message.message_id}`
      );
      await tx.wait();

      this.log("info", "utc.contribution_recorded", {
        messageId: message.message_id,
        normalizedIntent,
        participantAddress,
        score: Math.floor(score),
      });

      return {
        accepted: true,
        normalizedIntent,
        participantAddress,
        score: Math.floor(score),
      };
    } catch (error) {
      this.log("error", "utc.record_failed", {
        messageId: message.message_id,
        reason: error.message,
      });

      return {
        accepted: false,
        stage: "execution",
        errors: [error.message],
      };
    }
  }

  async settleCurrentRound(participants) {
    const participantList = participants?.length
      ? participants
      : await this.utcContract.getCurrentRoundParticipants();

    if (!participantList.length) {
      return {
        settled: false,
        stage: "precheck",
        errors: ["No participants available for settlement."],
      };
    }

    if (!this.settlementSigner) {
      return {
        settled: false,
        stage: "precheck",
        errors: ["No settlement signer configured."],
      };
    }

    try {
      const tx = await this.utcContract
        .connect(this.settlementSigner)
        .distributeRoundRewards(participantList);
      await tx.wait();

      this.log("info", "utc.round_settled", {
        participants: participantList.length,
      });

      return {
        settled: true,
        participants: participantList,
      };
    } catch (error) {
      this.log("error", "utc.settlement_failed", {
        participants: participantList.length,
        reason: error.message,
      });

      return {
        settled: false,
        stage: "execution",
        errors: [error.message],
      };
    }
  }
}

module.exports = {
  LocalCovenantRuntime,
  createStructuredLogger,
};
