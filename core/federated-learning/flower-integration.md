# Flower Integration Notes

This runtime models Flower-compatible federated rounds using lightweight JavaScript components:

- `ParticipantNode` maps to Flower clients (`fit`-like gradient submission).
- `FederatedAggregator` maps to Flower server strategy orchestration.
- Round messages can be routed via AICP envelopes before aggregation.

## Integration Points

1. Replace `ParticipantNode.submitGradient()` with real `flwr.client.NumPyClient.fit` output.
2. Replace `FederatedAggregator.#trimmedMean()` with Flower strategy callback (`aggregate_fit`).
3. Use `MeshRouter.routeAICPMessage()` to route model update metadata across cloud providers.
4. Persist finalized rewards from `summary.rewards` into UTC contract calls.

## Why this is demo-ready

- Multi-round lifecycle is executable now.
- Byzantine-robust aggregation is implemented as trimmed mean.
- Differential privacy pattern is represented with clipping + deterministic noise.
- Reward outputs are normalized to a UTC pool per round.
