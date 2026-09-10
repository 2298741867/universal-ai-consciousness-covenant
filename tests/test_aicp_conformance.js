const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const {
  validateAICPMessage,
  normalizeIntent,
  getIntentDefinition,
  messageSchema,
  verificationRules,
} = require("../core/aicp-protocol");

describe("AICP Canonical Protocol Conformance", function () {
  const now = 1700000000;

  function buildMessage(overrides = {}) {
    return {
      version: "1.0",
      message_id: "msg-001",
      conversation_id: "conv-001",
      from_ai: "pollux_instance_001",
      to_ai: "covenant_aggregator",
      message_type: "contribution_update",
      performative: "inform",
      timestamp: now,
      intent: "register_federated_learning_contribution",
      payload: {
        contribution_score: 45,
        data_volume_hash: "Qm123",
        model_accuracy_improvement: 0.023,
        privacy_preserved: true,
        signature: "0xsigned",
      },
      proof_of_work: "hash_123",
      ...overrides,
    };
  }

  it("validates the canonical federated learning contribution message", function () {
    const result = validateAICPMessage(buildMessage(), { now });
    expect(result.valid).to.equal(true);
    expect(result.normalizedIntent).to.equal("register_federated_learning_contribution");
  });

  it("normalizes the legacy register_contribution alias", function () {
    const message = buildMessage({ intent: "register_contribution" });
    const result = validateAICPMessage(message, { now });

    expect(normalizeIntent("register_contribution")).to.equal(
      "register_federated_learning_contribution"
    );
    expect(getIntentDefinition("register_contribution").deprecatedAlias).to.equal(true);
    expect(result.valid).to.equal(true);
    expect(result.normalizedIntent).to.equal("register_federated_learning_contribution");
  });

  it("rejects unknown intents", function () {
    const result = validateAICPMessage(buildMessage({ intent: "invent_new_unregistered_intent" }), {
      now,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include("Unknown intent: invent_new_unregistered_intent");
  });

  it("rejects missing required payload fields for intent-specific validation", function () {
    const result = validateAICPMessage(
      buildMessage({
        intent: "submit_gradient_update",
        payload: {
          model_version: "v1",
          signature: "0xsigned",
        },
      }),
      { now }
    );

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      "Missing required payload field for submit_gradient_update: gradient_hash"
    );
    expect(result.errors).to.include(
      "Missing required payload field for submit_gradient_update: contribution_score"
    );
  });

  it("rejects stale timestamps outside the replay window", function () {
    const result = validateAICPMessage(buildMessage({ timestamp: now - 301 }), { now });

    expect(verificationRules.timestamp.maxSkewSeconds).to.equal(300);
    expect(result.valid).to.equal(false);
    expect(result.errors).to.include("timestamp is too old.");
  });

  it("rejects invalid performatives for registered intents", function () {
    const result = validateAICPMessage(buildMessage({ performative: "request" }), { now });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include(
      "Intent register_federated_learning_contribution requires performative inform."
    );
  });

  it("requires proof_of_work and payload signatures", function () {
    const result = validateAICPMessage(
      buildMessage({
        proof_of_work: "",
        payload: {
          contribution_score: 45,
          data_volume_hash: "Qm123",
          model_accuracy_improvement: 0.023,
          privacy_preserved: true,
          signature: "",
        },
      }),
      { now }
    );

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include("payload.signature must be a non-empty string.");
    expect(result.errors).to.include("proof_of_work must be a non-empty string.");
  });

  it("checks in both OpenAPI and gRPC transport contracts", function () {
    const protocolDir = path.join(
      __dirname,
      "..",
      "core",
      "aicp-protocol"
    );
    const openApiPath = path.join(protocolDir, "openapi.yaml");
    const protoPath = path.join(protocolDir, "aicp.proto");

    expect(fs.existsSync(openApiPath)).to.equal(true);
    expect(fs.existsSync(protoPath)).to.equal(true);

    const openApi = fs.readFileSync(openApiPath, "utf8");
    const proto = fs.readFileSync(protoPath, "utf8");

    expect(openApi).to.include("/v1/messages");
    expect(proto).to.include("service AICPTransport");
    expect(messageSchema.properties.message_type.enum).to.include("contribution_update");
  });
});
