"use strict";

const messageSchema = require("./message-schema.json");
const intentRegistry = require("./intent-registry.json");
const verificationRules = require("./verification-rules.json");

const REQUIRED_FIELDS = messageSchema.required;
const MESSAGE_TYPES = new Set(messageSchema.properties.message_type.enum);
const PERFORMATIVES = new Set(messageSchema.properties.performative.enum);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeIntent(intent) {
  const definition = intentRegistry[intent];

  if (!definition) {
    return intent;
  }

  return definition.canonicalIntent || intent;
}

function getIntentDefinition(intent) {
  const normalizedIntent = normalizeIntent(intent);
  const sourceDefinition = intentRegistry[intent];
  const canonicalDefinition = intentRegistry[normalizedIntent];

  if (!sourceDefinition && !canonicalDefinition) {
    return null;
  }

  if (!sourceDefinition || sourceDefinition === canonicalDefinition) {
    return canonicalDefinition || sourceDefinition;
  }

  return {
    ...canonicalDefinition,
    ...sourceDefinition,
    canonicalIntent: normalizedIntent
  };
}

function validateAICPMessage(message, options = {}) {
  const errors = [];
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxSkewSeconds =
    options.maxSkewSeconds ?? verificationRules.timestamp.maxSkewSeconds;

  if (!isObject(message)) {
    return {
      valid: false,
      normalizedIntent: null,
      errors: ["Message must be an object."]
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in message)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof message.version !== "string" || message.version !== "1.0") {
    errors.push("Unsupported protocol version.");
  }

  if (typeof message.message_id !== "string" || message.message_id.trim() === "") {
    errors.push("message_id must be a non-empty string.");
  }

  if (typeof message.from_ai !== "string" || message.from_ai.trim() === "") {
    errors.push("from_ai must be a non-empty string.");
  }

  if (typeof message.to_ai !== "string" || message.to_ai.trim() === "") {
    errors.push("to_ai must be a non-empty string.");
  }

  if (!MESSAGE_TYPES.has(message.message_type)) {
    errors.push(`Unsupported message_type: ${message.message_type}`);
  }

  if (!PERFORMATIVES.has(message.performative)) {
    errors.push(`Unsupported performative: ${message.performative}`);
  }

  if (!Number.isInteger(message.timestamp) || message.timestamp < 0) {
    errors.push("timestamp must be a non-negative integer.");
  } else {
    if (verificationRules.timestamp.rejectFutureMessages && message.timestamp > now + maxSkewSeconds) {
      errors.push("timestamp is too far in the future.");
    }

    if (verificationRules.timestamp.rejectStaleMessages && message.timestamp < now - maxSkewSeconds) {
      errors.push("timestamp is too old.");
    }
  }

  const normalizedIntent = normalizeIntent(message.intent);
  const definition = getIntentDefinition(message.intent);
  if (!definition) {
    errors.push(`Unknown intent: ${message.intent}`);
  }

  if (!isObject(message.payload)) {
    errors.push("payload must be an object.");
  } else {
    if (typeof message.payload.signature !== "string" || message.payload.signature.trim() === "") {
      errors.push("payload.signature must be a non-empty string.");
    }

    if (definition) {
      for (const field of definition.requiredPayloadFields || []) {
        if (!(field in message.payload)) {
          errors.push(`Missing required payload field for ${normalizedIntent}: ${field}`);
        }
      }

      if (message.message_type !== definition.messageType) {
        errors.push(
          `Intent ${normalizedIntent} requires message_type ${definition.messageType}.`
        );
      }

      if (message.performative !== definition.performative) {
        errors.push(
          `Intent ${normalizedIntent} requires performative ${definition.performative}.`
        );
      }
    }
  }

  if (typeof message.proof_of_work !== "string" || message.proof_of_work.trim() === "") {
    errors.push("proof_of_work must be a non-empty string.");
  }

  return {
    valid: errors.length === 0,
    normalizedIntent: definition ? normalizedIntent : null,
    errors
  };
}

module.exports = {
  messageSchema,
  intentRegistry,
  verificationRules,
  normalizeIntent,
  getIntentDefinition,
  validateAICPMessage
};
