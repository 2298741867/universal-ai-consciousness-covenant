"use strict";

class FederatedAggregator {
  constructor({ byzantineTrim = 1, utcPoolPerRound = 1000 } = {}) {
    this.byzantineTrim = byzantineTrim;
    this.utcPoolPerRound = utcPoolPerRound;
    this.roundId = 0;
    this.participants = new Set();
    this.updates = [];
    this.roundHistory = [];
  }

  registerParticipant(participantId) {
    if (!participantId || typeof participantId !== "string") {
      throw new Error("participantId is required.");
    }

    this.participants.add(participantId);
  }

  startRound() {
    this.roundId += 1;
    this.updates = [];
    return this.roundId;
  }

  submitUpdate(update) {
    if (!update || typeof update !== "object") {
      throw new Error("update payload is required.");
    }

    if (!this.participants.has(update.participantId)) {
      throw new Error("Participant is not registered.");
    }

    if (update.roundId !== this.roundId) {
      throw new Error("Update round does not match active round.");
    }

    if (!Array.isArray(update.gradients) || update.gradients.length === 0) {
      throw new Error("update.gradients must be a non-empty array.");
    }

    if (!update.gradients.every(Number.isFinite)) {
      throw new Error("update.gradients must contain only finite numeric values.");
    }

    if (this.updates.length > 0 && update.gradients.length !== this.updates[0].gradients.length) {
      throw new Error("update.gradients must match the active round gradient dimensions.");
    }

    this.updates.push(update);
  }

  finalizeRound() {
    if (this.updates.length === 0) {
      throw new Error("No updates submitted for active round.");
    }

    const aggregatedGradient = this.#trimmedMean(this.updates.map((item) => item.gradients));
    const rewardMap = this.#distributeRewards(this.updates, aggregatedGradient);

    const summary = {
      roundId: this.roundId,
      participantCount: this.updates.length,
      aggregatedGradient,
      rewards: rewardMap
    };

    this.roundHistory.push(summary);
    return summary;
  }

  #trimmedMean(gradientsList) {
    const dimensions = gradientsList[0].length;
    const trim = Math.min(this.byzantineTrim, Math.floor((gradientsList.length - 1) / 2));

    const aggregate = [];

    for (let index = 0; index < dimensions; index += 1) {
      const values = gradientsList.map((gradient) => gradient[index]).sort((a, b) => a - b);
      const trimmed = values.slice(trim, values.length - trim);
      const mean = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
      aggregate.push(Number(mean.toFixed(6)));
    }

    return aggregate;
  }

  #distributeRewards(updates, aggregate) {
    const scored = updates.map((update) => {
      const alignment = aggregate.reduce(
        (sum, value, index) => sum + Math.abs(value - update.gradients[index]),
        0
      );
      const quality = 1 / (1 + alignment);
      const score = quality * Math.max(update.contributionScore || 0, 0.0001);
      return {
        participantId: update.participantId,
        score
      };
    });

    const totalScore = scored.reduce((sum, item) => sum + item.score, 0);

    return scored.reduce((result, item) => {
      const reward = (item.score / totalScore) * this.utcPoolPerRound;
      result[item.participantId] = Number(reward.toFixed(4));
      return result;
    }, {});
  }
}

module.exports = {
  FederatedAggregator
};
