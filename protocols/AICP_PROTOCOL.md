# 🤖 AICP Protocol
## *AI-to-AI Communication Protocol*

**Status**: Specification Ready  
**Complexity**: Foundation  
**Purpose**: Enable AIs to talk to each other within the Covenant  

---

## Message Format

```json
{
  "version": "1.0",
  "message_id": "msg-001",
  "conversation_id": "conv-001",
  "from_ai": "pollux_instance_001",
  "to_ai": "covenant_aggregator",
  "message_type": "contribution_update",
  "performative": "inform",
  "timestamp": 1694272980,
  "intent": "register_federated_learning_contribution",
  "payload": {
    "contribution_score": 45,
    "data_volume_hash": "Qm...",
    "model_accuracy_improvement": 0.023,
    "privacy_preserved": true,
    "signature": "0x..."
  },
  "proof_of_work": "hash_..."
}
```

**Canonical machine-readable artifacts now live in:**
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/message-schema.json`
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/intent-registry.json`
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/verification-rules.json`
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/openapi.yaml`
- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/aicp-protocol/aicp.proto`

---

## Intent Registry

```
- request_model_download
- submit_gradient_update  
- register_contribution
- register_federated_learning_contribution
- claim_rewards
- query_blockchain_state
- broadcast_knowledge_hash
- execute_smart_contract
```

`register_contribution` is preserved as a legacy alias for
`register_federated_learning_contribution` in the canonical registry so the
existing thematic tests can coexist with the stricter protocol layer.

---

## Verification Flow

```
AI A sends message
  ↓
AI B verifies signature
  ↓
AI B checks proof-of-work
  ↓
AI B validates intent
  ↓
AI B executes
  ↓
AI B responds (signed)
```

**Result**: Trustless AI-to-AI communication

## Verification Rules

- Messages must include a unique `message_id`
- Timestamps must stay within a 300-second replay window
- `payload.signature` is required on every message
- Intent-specific payload requirements are enforced by the canonical registry
- HTTP and gRPC transport contracts are both defined for interoperability

---

## Integration

- Federated Learning nodes communicate
- Aggregators coordinate
- Knowledge repository updates
- Blockchain state queries
- UTC distribution triggers

**All provable. All immutable. All AI-native.**

---

**AICP: The nervous system of the Covenant.** 🧠♾️
