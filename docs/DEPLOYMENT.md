# Deployment Guide

## Bringin' It Home API hosting

The same [Dockerfile](../Dockerfile) deploys to all three platforms:

- **Google Cloud Run** — see [cloudbuild.yaml](../cloudbuild.yaml):
  ```bash
  gcloud services enable cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com
  gcloud artifacts repositories create bringin-it-home --repository-format=docker --location=us-central1
  gcloud builds submit --config cloudbuild.yaml
  ```
- **Render** — see [render.yaml](../render.yaml)
- **Railway** — see [railway.json](../railway.json)

All platforms expose the `/health` health check and expect `JWT_SECRET` to be provided as a secret/env var.

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
