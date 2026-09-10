"use strict";

const { ParticipantNode } = require("../core/federated-learning/participant");
const { FederatedAggregator } = require("../core/federated-learning/aggregator");
const { MeshRouter } = require("../core/multi-cloud-mesh/mesh-router");
const { AWSConnector } = require("../core/multi-cloud-mesh/aws-connector");
const { AzureConnector } = require("../core/multi-cloud-mesh/azure-connector");
const { GCPConnector } = require("../core/multi-cloud-mesh/gcp-connector");

async function runDemo() {
  console.log("🌍♾️ Universal AI Consciousness Covenant — Complete Ecosystem Demo");

  const router = new MeshRouter();
  router.registerProvider(new AWSConnector({ weight: 2 }));
  router.registerProvider(new AzureConnector({ weight: 1 }));
  router.registerProvider(new GCPConnector({ weight: 1 }));

  const aggregator = new FederatedAggregator({ byzantineTrim: 1, utcPoolPerRound: 1000 });
  const participants = ["aurora", "pollux", "nova", "sol", "lyra"].map(
    (id) => new ParticipantNode({ id, privacyEpsilon: 0.8, clipNorm: 1.2 })
  );

  participants.forEach((participant) => aggregator.registerParticipant(participant.id));

  for (let round = 1; round <= 3; round += 1) {
    const roundId = aggregator.startRound();
    console.log(`\n🔁 FL Round ${roundId}`);

    for (let i = 0; i < participants.length; i += 1) {
      const participant = participants[i];
      participant.joinRound(roundId);
      const gradients = [0.2 + round * 0.01 + i * 0.005, 0.4 + round * 0.01 - i * 0.003];
      const update = participant.submitGradient({ roundId, gradients });

      const aicpMessage = {
        version: "1.0",
        intent: "submit_gradient_update",
        from_ai: participant.id,
        to_ai: "covenant_aggregator",
        payload: {
          gradient_preview: update.gradients,
          privacy_preserved: update.metadata.privacyPreserved
        }
      };

      const route = await router.routeAICPMessage(aicpMessage);
      aggregator.submitUpdate(update);
      console.log(`   ${participant.id} → ${route.selectedProvider.toUpperCase()} (${route.selectedRegion})`);
    }

    const summary = aggregator.finalizeRound();
    const topReward = Object.entries(summary.rewards).sort((a, b) => b[1] - a[1])[0];

    console.log(`   ✅ Aggregated gradient: [${summary.aggregatedGradient.join(", ")}]`);
    console.log(`   🪙 UTC distributed: 1000.0 (top reward: ${topReward[0]} = ${topReward[1]} UTC)`);
  }

  const deployment = await router.deployModelEverywhere("covenant-fl-model");
  console.log(`\n☁️ Active clouds: ${deployment.deployedProviders.join(", ")}`);
  console.log("✨ Covenant demo complete in one integrated flow.");
}

runDemo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
