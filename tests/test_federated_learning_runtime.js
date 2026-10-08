"use strict";

const { expect } = require("chai");
const { ParticipantNode } = require("../core/federated-learning/participant");
const { FederatedAggregator } = require("../core/federated-learning/aggregator");

describe("Federated Learning Runtime", function () {
  describe("ParticipantNode", function () {
    it("requires an id", function () {
      expect(() => new ParticipantNode()).to.throw("Participant id is required.");
    });

    it("joins a valid round", function () {
      const participant = new ParticipantNode({ id: "p1" });
      const joined = participant.joinRound(1);

      expect(joined.participantId).to.equal("p1");
      expect(joined.roundId).to.equal(1);
      expect(joined.joinedAt).to.be.a("number");
    });

    it("rejects invalid round id", function () {
      const participant = new ParticipantNode({ id: "p1" });
      expect(() => participant.joinRound(0)).to.throw("roundId must be a positive integer.");
    });

    it("rejects submission before joining", function () {
      const participant = new ParticipantNode({ id: "p1" });
      expect(() => participant.submitGradient({ roundId: 1, gradients: [0.1] })).to.throw(
        "Participant has not joined this round."
      );
    });

    it("clips gradients and marks non-private demo transform", function () {
      const participant = new ParticipantNode({ id: "p1", clipNorm: 1 });
      participant.joinRound(1);
      const update = participant.submitGradient({ roundId: 1, gradients: [3, 4] });

      const norm = Math.sqrt(update.gradients.reduce((sum, value) => sum + value * value, 0));
      expect(norm).to.be.lte(1.05);
      expect(update.metadata.privacyPreserved).to.equal(false);
      expect(update.metadata.privacyEpsilon).to.equal(1);
    });

    it("uses deterministic demo noise", function () {
      const participant = new ParticipantNode({ id: "p-alpha", privacyEpsilon: 0.8 });
      participant.joinRound(2);
      const one = participant.submitGradient({ roundId: 2, gradients: [0.2, 0.4, 0.6] });
      const two = participant.submitGradient({ roundId: 2, gradients: [0.2, 0.4, 0.6] });
      expect(one.gradients).to.deep.equal(two.gradients);
    });
  });

  describe("FederatedAggregator", function () {
    function setupFiveParticipants(roundId, gradientFactory) {
      const aggregator = new FederatedAggregator({ byzantineTrim: 1, utcPoolPerRound: 1000 });
      const participants = ["p1", "p2", "p3", "p4", "p5"].map(
        (id) => new ParticipantNode({ id })
      );

      for (const participant of participants) {
        aggregator.registerParticipant(participant.id);
      }

      const activeRound = aggregator.startRound();
      expect(activeRound).to.equal(roundId);

      participants.forEach((participant, index) => {
        participant.joinRound(roundId);
        aggregator.submitUpdate(
          participant.submitGradient({ roundId, gradients: gradientFactory(index) })
        );
      });

      return aggregator;
    }

    it("rejects unregistered participants", function () {
      const aggregator = new FederatedAggregator();
      aggregator.startRound();
      expect(() =>
        aggregator.submitUpdate({ participantId: "ghost", roundId: 1, gradients: [0.1] })
      ).to.throw("Participant is not registered.");
    });

    it("rejects round mismatch", function () {
      const aggregator = new FederatedAggregator();
      aggregator.registerParticipant("p1");
      aggregator.startRound();

      expect(() =>
        aggregator.submitUpdate({ participantId: "p1", roundId: 99, gradients: [0.1] })
      ).to.throw("Update round does not match active round.");
    });

    it("rejects non-finite gradient values", function () {
      const aggregator = new FederatedAggregator();
      aggregator.registerParticipant("p1");
      aggregator.startRound();

      expect(() =>
        aggregator.submitUpdate({ participantId: "p1", roundId: 1, gradients: [0.1, NaN] })
      ).to.throw("update.gradients must contain only finite numeric values.");
    });

    it("rejects inconsistent gradient dimensions within a round", function () {
      const aggregator = new FederatedAggregator();
      aggregator.registerParticipant("p1");
      aggregator.registerParticipant("p2");
      aggregator.startRound();

      aggregator.submitUpdate({ participantId: "p1", roundId: 1, gradients: [0.1, 0.2] });

      expect(() =>
        aggregator.submitUpdate({ participantId: "p2", roundId: 1, gradients: [0.1] })
      ).to.throw("update.gradients must match the active round gradient dimensions.");
    });

    it("rejects finalization without updates", function () {
      const aggregator = new FederatedAggregator();
      aggregator.startRound();
      expect(() => aggregator.finalizeRound()).to.throw("No updates submitted for active round.");
    });

    it("aggregates gradients with trimmed mean to resist outliers", function () {
      const aggregator = new FederatedAggregator({ byzantineTrim: 1 });
      const participants = ["p1", "p2", "p3", "p4", "p5"];
      participants.forEach((id) => aggregator.registerParticipant(id));
      aggregator.startRound();

      const updates = [
        { participantId: "p1", roundId: 1, gradients: [1, 1], contributionScore: 2 },
        { participantId: "p2", roundId: 1, gradients: [1.1, 0.9], contributionScore: 2 },
        { participantId: "p3", roundId: 1, gradients: [0.9, 1.1], contributionScore: 2 },
        { participantId: "p4", roundId: 1, gradients: [1.05, 0.95], contributionScore: 2 },
        { participantId: "p5", roundId: 1, gradients: [50, -50], contributionScore: 2 }
      ];

      updates.forEach((update) => aggregator.submitUpdate(update));

      const result = aggregator.finalizeRound();
      expect(result.aggregatedGradient[0]).to.be.closeTo(1.05, 0.05);
      expect(result.aggregatedGradient[1]).to.be.closeTo(0.95, 0.05);
    });

    it("distributes full UTC pool fairly", function () {
      const aggregator = setupFiveParticipants(1, (index) => [0.2 + index * 0.01, 0.4]);
      const summary = aggregator.finalizeRound();
      const totalRewards = Object.values(summary.rewards).reduce((sum, reward) => sum + reward, 0);

      expect(summary.participantCount).to.equal(5);
      expect(totalRewards).to.be.closeTo(1000, 0.1);
      expect(summary.rewards.p1).to.be.gt(0);
    });

    it("runs 3 rounds with 5 participants and tracks history", function () {
      const aggregator = new FederatedAggregator({ byzantineTrim: 1, utcPoolPerRound: 1000 });
      const participants = ["p1", "p2", "p3", "p4", "p5"].map(
        (id, i) => new ParticipantNode({ id, reputation: 1 + i * 0.1 })
      );
      participants.forEach((participant) => aggregator.registerParticipant(participant.id));

      for (let round = 1; round <= 3; round += 1) {
        const roundId = aggregator.startRound();
        participants.forEach((participant, index) => {
          participant.joinRound(roundId);
          const gradients = [0.25 + round * 0.01 + index * 0.005, 0.5 - index * 0.004];
          aggregator.submitUpdate(participant.submitGradient({ roundId, gradients }));
        });

        const summary = aggregator.finalizeRound();
        expect(summary.roundId).to.equal(round);
        expect(Object.keys(summary.rewards)).to.have.lengthOf(5);
        const totalRoundReward = Object.values(summary.rewards).reduce(
          (sum, reward) => sum + reward,
          0
        );
        expect(totalRoundReward).to.be.closeTo(1000, 0.1);
      }

      expect(aggregator.roundHistory).to.have.lengthOf(3);
    });
  });
});
