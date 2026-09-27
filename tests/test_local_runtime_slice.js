const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  LocalCovenantRuntime,
} = require("../core/runtime/local-covenant-runtime");
const { FederatedParticipantNode } = require("../core/federated-learning/participant-node");
const { FederatedAggregatorService } = require("../core/federated-learning/aggregator-service");

describe("Local Runtime Slice", function () {
  let utcContract;
  let owner;
  let participant1;
  let participant2;
  let runtimeSigner;

  beforeEach(async function () {
    [owner, participant1, participant2, runtimeSigner] = await ethers.getSigners();

    const UTC = await ethers.getContractFactory("UnifiedTokenCovenant");
    utcContract = await UTC.deploy();
    await utcContract.deployed();
    await utcContract.authorizeContributor(runtimeSigner.address);
  });

  function buildContributionMessage(overrides = {}) {
    return {
      version: "1.0",
      message_id: "runtime-msg-001",
      from_ai: participant1.address,
      to_ai: "local_aggregator",
      message_type: "contribution_update",
      performative: "inform",
      timestamp: 1700000000,
      intent: "register_federated_learning_contribution",
      payload: {
        participant_address: participant1.address,
        contribution_score: 55,
        data_volume_hash: "QmRuntimeHash",
        model_accuracy_improvement: 0.012,
        privacy_preserved: true,
        signature: "0xlocalruntime",
      },
      proof_of_work: "pow-runtime-001",
      ...overrides,
    };
  }

  it("reports runtime health", async function () {
    const runtime = new LocalCovenantRuntime({
      utcContract: utcContract.connect(runtimeSigner),
      settlementSigner: owner,
      logger: () => {},
    });

    const health = await runtime.healthCheck();
    expect(health.status).to.equal("ok");
    expect(health.currentRound).to.equal("0");
    expect(health.canSettle).to.equal(true);
  });

  it("records contributions from valid AICP messages", async function () {
    const runtime = new LocalCovenantRuntime({
      utcContract: utcContract.connect(runtimeSigner),
      settlementSigner: owner,
      logger: () => {},
    });

    const result = await runtime.intakeMessage(buildContributionMessage(), {
      now: 1700000000,
    });

    expect(result.accepted).to.equal(true);
    expect(await utcContract.getTotalContributions(participant1.address)).to.equal(55);
  });

  it("rejects invalid AICP messages with validation errors", async function () {
    const runtime = new LocalCovenantRuntime({
      utcContract: utcContract.connect(runtimeSigner),
      settlementSigner: owner,
      logger: () => {},
    });

    const invalid = buildContributionMessage({
      payload: {
        contribution_score: 55,
        signature: "0xmissingFields",
      },
    });

    const result = await runtime.intakeMessage(invalid, { now: 1700000000 });
    expect(result.accepted).to.equal(false);
    expect(result.stage).to.equal("validation");
    expect(result.errors.some((error) => error.includes("Missing required payload field"))).to.equal(
      true
    );
  });

  it("settles rewards after runtime intake for multiple participants", async function () {
    const runtime = new LocalCovenantRuntime({
      utcContract: utcContract.connect(runtimeSigner),
      settlementSigner: owner,
      logger: () => {},
    });

    await runtime.intakeMessage(buildContributionMessage(), { now: 1700000000 });
    await runtime.intakeMessage(
      buildContributionMessage({
        message_id: "runtime-msg-002",
        from_ai: participant2.address,
        payload: {
          participant_address: participant2.address,
          contribution_score: 45,
          data_volume_hash: "QmRuntimeHash2",
          model_accuracy_improvement: 0.01,
          privacy_preserved: true,
          signature: "0xlocalruntime2",
        },
        proof_of_work: "pow-runtime-002",
      }),
      { now: 1700000000 }
    );

    const settlement = await runtime.settleCurrentRound();
    expect(settlement.settled).to.equal(true);
    expect(await utcContract.currentRound()).to.equal(1);
    expect(await utcContract.balanceOf(participant1.address)).to.equal(ethers.utils.parseEther("550"));
    expect(await utcContract.balanceOf(participant2.address)).to.equal(ethers.utils.parseEther("450"));
  });

  it("runs participant + aggregator skeleton flow", async function () {
    const runtime = new LocalCovenantRuntime({
      utcContract: utcContract.connect(runtimeSigner),
      settlementSigner: owner,
      logger: () => {},
    });
    const aggregator = new FederatedAggregatorService({ runtime });
    const participant = new FederatedParticipantNode({
      participantAddress: participant1.address,
    });

    const message = participant.buildGradientIntent({
      messageId: "gradient-001",
      timestamp: 1700000000,
      modelVersion: "v1",
      gradientHash: "QmGradientHash1",
      improvement: 0.02,
    });

    const intake = await aggregator.processParticipantUpdate(message, { now: 1700000000 });
    expect(intake.accepted).to.equal(true);

    const settlement = await aggregator.settleRound();
    expect(settlement.settled).to.equal(true);
  });
});
