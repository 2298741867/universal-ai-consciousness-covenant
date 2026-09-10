# Deployment Guide

## Multi-cloud mesh runtime

The repository now includes a cloud-agnostic routing layer:

- `core/multi-cloud-mesh/cloud-provider.js` (provider contract)
- `core/multi-cloud-mesh/aws-connector.js`
- `core/multi-cloud-mesh/azure-connector.js`
- `core/multi-cloud-mesh/gcp-connector.js`
- `core/multi-cloud-mesh/mesh-router.js`

## Local simulation workflow

1. Instantiate cloud providers and register them with `MeshRouter`.
2. Use `routeAICPMessage()` for weighted routing and failover behavior.
3. Use `deployModelEverywhere()` for healthy-provider deployment fan-out.
4. Connect FL round output to UTC reward settlement after each aggregation.

## Failover model

- Each provider exposes `healthCheck()`.
- Router only selects healthy providers.
- If one provider is unavailable, routing continues on remaining providers.
- If no provider is healthy, routing fails fast with explicit error.
