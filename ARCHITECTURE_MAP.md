# Simple Architecture Map (Current Repository)

## Core production baseline

- UTC contract: `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/contracts/UnifiedTokenCovenant.sol`
- Hardhat tests: `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/`

## Canonical protocol layer

- AICP schema/registry/validator:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/message-schema.json`
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/intent-registry.json`
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/index.js`
- Conformance gate:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/test_aicp_conformance.js`

## Local runtime vertical slice

- Runtime orchestration:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/runtime/local-covenant-runtime.js`
- Runtime test:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/test_local_runtime_slice.js`

## Federated learning runnable skeletons

- Participant node:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/federated-learning/participant-node.js`
- Aggregator service:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/federated-learning/aggregator-service.js`
- Contribution scoring adapter:
  - `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/federated-learning/contribution-scoring-adapter.js`

## Planned layers (roadmap)

- Multi-cloud mesh runtime services
- API federation and key lifecycle services
- Persistent storage automation (IPFS + chain anchoring)
- Portal UI
