# AICP Quickstart

## 1) Required message fields

Every canonical AICP message must include:

- `version` (must be `"1.0"`)
- `message_id`
- `from_ai`
- `to_ai`
- `message_type`
- `performative`
- `timestamp`
- `intent`
- `payload` (object)
- `proof_of_work`

`payload.signature` is always required, and each intent can require additional payload fields from the registry.

## 2) Intent registry usage

Intent definitions live in:

- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/intent-registry.json`

Each intent declares:

- required `messageType`
- required `performative`
- `requiredPayloadFields`
- optional canonical aliasing (example: `register_contribution` → `register_federated_learning_contribution`)

## 3) Validation flow (`validateAICPMessage`)

Use:

- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/index.js`

Validation flow:

1. Schema-level required field checks
2. Base value checks (`version`, enums, timestamp window, proof-of-work)
3. Intent normalization and lookup
4. Intent-specific payload + performative + message type checks
5. Return `{ valid, normalizedIntent, errors }`

## 4) Minimal example

```js
const { validateAICPMessage } = require("./index");

const message = {
  version: "1.0",
  message_id: "msg-quickstart-1",
  from_ai: "0x1234567890123456789012345678901234567890",
  to_ai: "local_aggregator",
  message_type: "contribution_update",
  performative: "inform",
  timestamp: Math.floor(Date.now() / 1000),
  intent: "register_federated_learning_contribution",
  payload: {
    participant_address: "0x1234567890123456789012345678901234567890",
    contribution_score: 42,
    data_volume_hash: "Qm123",
    model_accuracy_improvement: 0.01,
    privacy_preserved: true,
    signature: "0xabc",
  },
  proof_of_work: "pow-quickstart",
};

const result = validateAICPMessage(message);
console.log(result);
```

## 5) Protocol change gate

Use conformance tests as the protocol gate:

```bash
npm run test:aicp
```

This includes:

- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/test_aicp_protocol.js`
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/test_aicp_conformance.js`
