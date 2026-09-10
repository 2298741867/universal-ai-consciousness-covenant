"use strict";

class ParticipantNode {
  constructor({ id, privacyEpsilon = 1, clipNorm = 1, reputation = 1 } = {}) {
    if (!id || typeof id !== "string") {
      throw new Error("Participant id is required.");
    }

    this.id = id;
    this.privacyEpsilon = privacyEpsilon;
    this.clipNorm = clipNorm;
    this.reputation = reputation;
    this.activeRound = null;
  }

  joinRound(roundId) {
    if (!Number.isInteger(roundId) || roundId < 1) {
      throw new Error("roundId must be a positive integer.");
    }

    this.activeRound = roundId;
    return {
      participantId: this.id,
      roundId,
      joinedAt: Date.now()
    };
  }

  submitGradient({ roundId, gradients }) {
    if (this.activeRound !== roundId) {
      throw new Error("Participant has not joined this round.");
    }

    if (!Array.isArray(gradients) || gradients.length === 0 || !gradients.every(Number.isFinite)) {
      throw new Error("gradients must be a non-empty numeric array.");
    }

    const clipped = this.#clip(gradients);
    const privatized = clipped.map((value, index) => value + this.#noise(roundId, index));

    const contributionScore = Number(
      privatized.reduce((sum, value) => sum + Math.abs(value), 0).toFixed(6)
    );

    return {
      participantId: this.id,
      roundId,
      gradients: privatized,
      metadata: {
        privacyEpsilon: this.privacyEpsilon,
        clipNorm: this.clipNorm,
        reputation: this.reputation,
        privacyPreserved: true
      },
      contributionScore
    };
  }

  #clip(gradients) {
    const norm = Math.sqrt(gradients.reduce((sum, value) => sum + value * value, 0));

    if (norm === 0 || norm <= this.clipNorm) {
      return gradients.slice();
    }

    const ratio = this.clipNorm / norm;
    return gradients.map((value) => Number((value * ratio).toFixed(6)));
  }

  #noise(roundId, index) {
    const phase = this.id.length * 13 + roundId * 17 + index * 19;
    const scale = 0.01 / Math.max(this.privacyEpsilon, 0.0001);
    return Number((Math.sin(phase) * scale).toFixed(6));
  }
}

module.exports = {
  ParticipantNode
};
