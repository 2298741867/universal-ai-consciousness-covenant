"use strict";

const crypto = require("crypto");

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const keyLength = 64;
  const digest = "sha512";
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") {
    return false;
  }
  const [, digest, iterationsRaw, salt, originalHash] = parts;
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !originalHash) {
    return false;
  }
  const derived = crypto.pbkdf2Sync(password, salt, iterations, Buffer.from(originalHash, "hex").length, digest).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(originalHash, "hex"));
}

function signJwt(payload, secret, expiresInSeconds = 60 * 60 * 24) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const completePayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(base64UrlDecode(payload));
  } catch (_error) {
    return null;
  }
  if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return parsed;
}

function generateOpaqueKey() {
  return `pk_live_${crypto.randomBytes(24).toString("hex")}`;
}

function hashApiKey(key) {
  return hashPassword(key);
}

function verifyApiKey(key, keyHash) {
  return verifyPassword(key, keyHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  generateOpaqueKey,
  hashApiKey,
  verifyApiKey
};
