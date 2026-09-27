"use strict";

class FederatedAggregatorService {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async processParticipantUpdate(message, options = {}) {
    return this.runtime.intakeMessage(message, options);
  }

  async settleRound(participants) {
    return this.runtime.settleCurrentRound(participants);
  }
}

module.exports = {
  FederatedAggregatorService,
};
