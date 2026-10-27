"use strict";

const crypto = require("crypto");
const { ParticipantNode } = require("../core/federated-learning/participant");
const { FederatedAggregator } = require("../core/federated-learning/aggregator");
const { MeshRouter } = require("../core/multi-cloud-mesh/mesh-router");
const { AWSConnector } = require("../core/multi-cloud-mesh/aws-connector");
const { AzureConnector } = require("../core/multi-cloud-mesh/azure-connector");
const { GCPConnector } = require("../core/multi-cloud-mesh/gcp-connector");
const { validateAICPMessage } = require("../core/aicp-protocol");

async function runDemo() {
  const verbose = process.argv.includes("--verbose");
  console.log("Community contribution demo");
  console.log("Local simulation only: no real AI training, cloud deployment, or token payments.");
  console.log("Processing 5 sample participants across 3 rounds.\n");

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
    if (verbose) console.log(`\nRound ${roundId} — technical details`);

    for (let i = 0; i < participants.length; i += 1) {
      const participant = participants[i];
      participant.joinRound(roundId);
      const gradients = [0.2 + round * 0.01 + i * 0.005, 0.4 + round * 0.01 - i * 0.003];
      const update = participant.submitGradient({ roundId, gradients });

      const gradientHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(update.gradients))
        .digest("hex");

      const aicpMessage = {
        version: "1.0",
        message_id: `msg-${participant.id}-${roundId}-${i}`,
        intent: "submit_gradient_update",
        from_ai: participant.id,
        to_ai: "covenant_aggregator",
        message_type: "contribution_update",
        performative: "inform",
        timestamp: Math.floor(Date.now() / 1000),
        payload: {
          model_version: `round-${roundId}`,
          gradient_hash: gradientHash,
          contribution_score: update.contributionScore,
          privacy_preserved: update.metadata.privacyPreserved,
          signature: `sig-${participant.id}-${roundId}-${i}`
        },
        proof_of_work: `pow-${roundId}-${i}`
      };

      const validation = validateAICPMessage(aicpMessage);
      if (!validation.valid) {
        throw new Error(`Invalid AICP message: ${validation.errors.join("; ")}`);
      }

      const route = await router.routeAICPMessage(aicpMessage);
      aggregator.submitUpdate(update);
      if (verbose) {
        console.log(`   ${participant.id} → ${route.selectedProvider.toUpperCase()} (${route.selectedRegion})`);
      }
    }

    const summary = aggregator.finalizeRound();
    if (verbose) {
      console.log(`   Aggregated gradient: [${summary.aggregatedGradient.join(", ")}]`);
      console.log(`   Simulated reward shares: ${JSON.stringify(summary.rewards)}`);
    }
    console.log(
      `Round ${roundId} complete: ${participants.length} contributions combined; ` +
      `${summary.rewards[participants[0].id]} simulated reward units per participant.`
    );
  }

  const deployment = await router.deployModelEverywhere("covenant-fl-model");
  if (verbose) console.log(`\nSimulated cloud deployments: ${deployment.deployedProviders.join(", ")}`);
  console.log("\nDone. All 3 rounds completed with equal simulated reward shares.");
  if (!verbose) console.log("For technical details, run: npm run demo:covenant -- --verbose");
}

runDemo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
