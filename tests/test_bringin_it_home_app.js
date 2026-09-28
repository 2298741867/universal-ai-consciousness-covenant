"use strict";

const { expect } = require("chai");
const request = require("supertest");
const sharp = require("sharp");
const { createApp } = require("../app/bringin-it-home/app");

async function makeBase64Image(color = { r: 120, g: 10, b: 200, alpha: 1 }) {
  const image = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: color
    }
  }).png().toBuffer();
  return image.toString("base64");
}

describe("Bringin' It Home API", function () {
  let app;
  let api;
  let userToken;
  let adminToken;

  beforeEach(async function () {
    app = createApp({
      dbPath: ":memory:",
      config: {
        env: "test",
        port: 0,
        jwtSecret: "test-secret",
        dbPath: ":memory:",
        listenerRewardUtc: 10,
        artistRewardUtc: 3,
        postRewardUtc: 5,
        maxPostsPerDay: 1,
        maxImageBytes: 1024 * 1024
      }
    });
    api = request(app);

    await api.post("/auth/register").send({
      email: "admin@example.com",
      password: "strongpass123",
      role: "admin"
    }).expect(201);
    await api.post("/auth/register").send({
      email: "user@example.com",
      password: "strongpass123"
    }).expect(201);

    const adminLogin = await api.post("/auth/login").send({
      email: "admin@example.com",
      password: "strongpass123"
    }).expect(200);
    adminToken = adminLogin.body.token;

    const userLogin = await api.post("/auth/login").send({
      email: "user@example.com",
      password: "strongpass123"
    }).expect(200);
    userToken = userLogin.body.token;
  });

  it("registers/login users and returns structured validation errors", async function () {
    const bad = await api.post("/auth/register").send({ email: "missing@example.com" }).expect(400);
    expect(bad.body.code).to.equal("VALIDATION_ERROR");

    const login = await api.post("/auth/login").send({
      email: "user@example.com",
      password: "strongpass123"
    }).expect(200);
    expect(login.body.token).to.be.a("string");
  });

  it("applies listen reward rules with heartbeats and idempotency", async function () {
    const track = await api
      .post("/tracks")
      .set("Authorization", adminToken)
      .send({ title: "Covenant Anthem" })
      .expect(201);

    const start = await api
      .post(`/tracks/${track.body.id}/listen/start`)
      .set("Authorization", userToken)
      .send({})
      .expect(201);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await api
        .post(`/tracks/${track.body.id}/listen/heartbeat`)
        .set("Authorization", userToken)
        .send({ listenSessionId: start.body.listenSessionId })
        .expect(200);
    }

    app.locals.db.prepare(
      "UPDATE listen_sessions SET started_at = datetime('now', '-31 seconds') WHERE id = ?"
    ).run(start.body.listenSessionId);

    const ended = await api
      .post(`/tracks/${track.body.id}/listen/end`)
      .set("Authorization", userToken)
      .send({ listenSessionId: start.body.listenSessionId, idempotencyKey: "end-1" })
      .expect(200);
    expect(ended.body.rewarded).to.equal(true);

    const userBalance = await api
      .get("/me/balance")
      .set("Authorization", userToken)
      .expect(200);
    expect(userBalance.body.balance).to.equal(10);

    const artistBalance = await api
      .get("/me/balance")
      .set("Authorization", adminToken)
      .expect(200);
    expect(artistBalance.body.balance).to.equal(3);

    const secondAttempt = await api
      .post(`/tracks/${track.body.id}/listen/end`)
      .set("Authorization", userToken)
      .send({ listenSessionId: start.body.listenSessionId, idempotencyKey: "end-1" })
      .expect(200);
    expect(secondAttempt.body.rewarded).to.equal(false);
  });

  it("rejects duplicate images and enforces post cap while rewarding ledger", async function () {
    const imageOne = await makeBase64Image({ r: 1, g: 2, b: 3, alpha: 1 });
    const imageTwo = await makeBase64Image({ r: 4, g: 5, b: 6, alpha: 1 });

    await api.post("/posts")
      .set("Authorization", userToken)
      .send({ caption: "first", imageBase64: imageOne, idempotencyKey: "post-1" })
      .expect(201);

    await api.post("/posts")
      .set("Authorization", userToken)
      .send({ caption: "dup", imageBase64: imageOne, idempotencyKey: "post-2" })
      .expect(400);

    await api.post("/posts")
      .set("Authorization", userToken)
      .send({ caption: "second", imageBase64: imageTwo, idempotencyKey: "post-3" })
      .expect(403);

    const balance = await api.get("/me/balance")
      .set("Authorization", userToken)
      .expect(200);
    expect(balance.body.balance).to.equal(5);
  });

  it("enforces partner scopes, logs audit events, and validates AICP payloads", async function () {
    const track = await api
      .post("/tracks")
      .set("Authorization", adminToken)
      .send({ title: "Partner Readable" })
      .expect(201);

    const partner = await api
      .post("/admin/partners")
      .set("Authorization", adminToken)
      .send({ name: "alpha-ai", kind: "ai", status: "active" })
      .expect(201);

    const key = await api
      .post(`/admin/partners/${partner.body.id}/keys`)
      .set("Authorization", adminToken)
      .send({})
      .expect(201);

    await api
      .get(`/partner/tracks/${track.body.id}`)
      .set("x-partner-key", key.body.apiKey)
      .expect(200);

    await api
      .post("/partner/aicp/validate")
      .set("x-partner-key", key.body.apiKey)
      .send({ message: {} })
      .expect(403);

    await api
      .patch(`/admin/partners/${partner.body.id}/scopes`)
      .set("Authorization", adminToken)
      .send({ scopes: ["tracks:read", "aicp:validate"] })
      .expect(200);

    const validAicp = await api
      .post("/partner/aicp/validate")
      .set("x-partner-key", key.body.apiKey)
      .send({
        message: {
          version: "1.0",
          message_id: "m-1",
          from_ai: "alpha",
          to_ai: "beta",
          message_type: "state_query",
          performative: "query_if",
          timestamp: Math.floor(Date.now() / 1000),
          intent: "request_global_state",
          payload: { requested_scope: "round_status", signature: "sig" },
          proof_of_work: "pow"
        }
      })
      .expect(200);
    expect(validAicp.body.valid).to.equal(true);

    await api
      .patch(`/admin/partners/${partner.body.id}/scopes`)
      .set("Authorization", adminToken)
      .send({ scopes: ["tokens:mint"] })
      .expect(403);

    const audit = await api
      .get(`/admin/partners/${partner.body.id}/audit`)
      .set("Authorization", adminToken)
      .expect(200);
    expect(audit.body.logs.length).to.be.greaterThan(1);
    expect(audit.body.logs.some((item) => item.outcome === "denied")).to.equal(true);
  });
});
