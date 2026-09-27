"use strict";

const { scoreGradientUpdate } = require("./contribution-scoring-adapter");

class FederatedParticipantNode {
  constructor({ participantAddress, modelId = "utc-model-v1" }) {
    this.participantAddress = participantAddress;
    this.modelId = modelId;
  }

  buildGradientIntent({ messageId, timestamp, modelVersion, gradientHash, improvement }) {
    return {
      version: "1.0",
      message_id: messageId,
      from_ai: this.participantAddress,
      to_ai: "local_aggregator",
      message_type: "contribution_update",
      performative: "inform",
      timestamp,
      intent: "register_federated_learning_contribution",
      payload: {
        participant_address: this.participantAddress,
        model_id: this.modelId,
        model_version: modelVersion,
        gradient_hash: gradientHash,
        contribution_score: scoreGradientUpdate({
          modelAccuracyImprovement: improvement,
          dataVolumeWeight: 1,
          privacyPreserved: true,
        }),
        data_volume_hash: gradientHash,
        model_accuracy_improvement: improvement,
        privacy_preserved: true,
        signature: "local-sim-signature",
      },
      proof_of_work: `pow-${messageId}`,
    };
  }
}

module.exports = {
  FederatedParticipantNode,
};
