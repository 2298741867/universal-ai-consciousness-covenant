"use strict";

const { expect } = require("chai");
const request = require("supertest");
const Stripe = require("stripe");
const { createApp } = require("../app/bringin-it-home/app");
const { signJwt } = require("../app/bringin-it-home/auth");
const { getConfig } = require("../app/bringin-it-home/config");
const { createDatabase } = require("../app/bringin-it-home/db");
const { splitCents } = require("../app/bringin-it-home/rewards");
const { grantAdmin } = require("../app/bringin-it-home/grant-admin");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WEBHOOK_SECRET = "whsec_local_test_only";

function fakeStripe() {
  const sdk = new Stripe("sk_test_local_only");
  const intents = new Map();
  const transfers = new Map();
  const state = { transferCalls: [], fundingCalls: [], accountCalls: [], linkCalls: [], eligible: true, failure: null };
  return {
    state,
    webhooks: sdk.webhooks,
    accounts: {
      create: async (params, options) => {
        state.accountCalls.push({ params, options });
        return { id: `acct_${params.metadata.cash_user_id}` };
      },
      retrieve: async () => ({
        details_submitted: state.eligible, payouts_enabled: state.eligible,
        capabilities: { transfers: state.eligible ? "active" : "pending" }
      })
    },
    accountLinks: {
      create: async (params) => {
        state.linkCalls.push(params);
        return { url: "https://connect.stripe.com/test/onboarding", expires_at: 2000000000 };
      }
    },
    paymentIntents: {
      create: async (params, options) => {
        state.fundingCalls.push({ params, options });
        const id = `pi_${params.metadata.cash_funding_id}`;
        const intent = {
          id, amount: params.amount, amount_received: params.amount, status: "succeeded",
          currency: "usd", livemode: false, metadata: params.metadata,
          client_secret: `${id}_secret_test`,
          latest_charge: {
            id: `ch_${id}`, amount: params.amount, currency: "usd", paid: true,
            livemode: false, refunded: false, amount_refunded: 0, disputed: false,
            balance_transaction: { net: params.amount - 29, currency: "usd" }
          }
        };
        intents.set(id, intent);
        return intent;
      },
      retrieve: async (id) => intents.get(id)
    },
    charges: {
      retrieve: async (id) => [...intents.values()].find((intent) => intent.latest_charge.id === id).latest_charge
    },
    transfers: {
      create: async (params, options) => {
        state.transferCalls.push({ params, options });
        if (state.failure === "before") throw new Error("Connection failed before sending");
        let transfer = transfers.get(options.idempotencyKey);
        if (!transfer) {
          transfer = { ...params, id: `tr_${transfers.size + 1}`, livemode: false, reversed: false, amount_reversed: 0 };
          transfers.set(options.idempotencyKey, transfer);
        }
        if (state.failure === "after") throw new Error("Response lost after Stripe committed transfer");
        return transfer;
      },
      list: async (params) => ({
        data: [...transfers.values()].filter((row) => row.transfer_group === params.transfer_group), has_more: false
      })
    }
  };
}

describe("Funded rewards (Stripe Connect test mode)", function () {
  let app, api, stripe, adminToken, userToken, secondToken, sequence;
  const config = () => ({
    ...getConfig(), env: "test", dbPath: ":memory:", jwtSecret: "test-secret",
    stripeSecretKey: "sk_test_local_only", stripeWebhookSecret: WEBHOOK_SECRET,
    rewardsPublicUrl: "http://localhost:3000"
  });
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });

  beforeEach(function () {
    stripe = fakeStripe();
    app = createApp({ config: config(), stripe });
    api = request(app);
    sequence = 0;
    const insert = app.locals.db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, 'not-used', ?)");
    insert.run(1, "admin@example.com", "admin");
    insert.run(2, "contributor@example.com", "user");
    insert.run(3, "second@example.com", "user");
    adminToken = signJwt({ sub: 1 }, "test-secret");
    userToken = signJwt({ sub: 2 }, "test-secret");
    secondToken = signJwt({ sub: 3 }, "test-secret");
  });
  afterEach(function () {
    if (app.locals.db.open) app.locals.db.close();
  });

  function webhook(type, object, options = {}) {
    const event = { id: `evt_${++sequence}`, type, livemode: false, data: { object }, ...options };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return api.post("/rewards/stripe/webhook").set("Content-Type", "application/json")
      .set("stripe-signature", signature).send(payload);
  }
  async function funding(amount = 1000, confirmed = true) {
    const result = await api.post("/rewards/admin/funding").set(bearer(adminToken))
      .set("Idempotency-Key", `fund-${++sequence}`).send({ amountCents: amount }).expect(201);
    const pool = result.body.funding;
    if (confirmed) {
      await webhook("payment_intent.succeeded", {
        id: pool.payment_intent, metadata: { cash_funding_id: pool.id }
      }).expect(200);
    }
    return pool;
  }
  async function contribution(token = userToken, points = 1) {
    const result = await api.post("/rewards/contributions").set(bearer(token)).send({
      kind: "knowledge", title: "An accessible learning resource",
      description: "Original educational material with sources and a transcript.",
      evidenceUrl: `https://example.com/resource/${++sequence}`
    }).expect(201);
    await api.post(`/rewards/admin/contributions/${result.body.id}/review`).set(bearer(adminToken))
      .send({ decision: "approved", points, reason: "Verified original work, usefulness and attribution." }).expect(200);
    return result.body.id;
  }
  async function allocate(pool, ids) {
    const result = await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: ids }).expect(201);
    return result.body.rewards;
  }
  async function preparedReward() {
    const pool = await funding();
    const id = await contribution();
    const [reward] = await allocate(pool, [id]);
    await api.post("/rewards/connect/onboard").set(bearer(userToken)).send({}).expect(200);
    return { pool, reward };
  }
  function transfer(id) {
    return api.post(`/rewards/admin/rewards/${id}/transfer`).set(bearer(adminToken)).send({});
  }

  it("disables provider operations without configuration and refuses live keys", async function () {
    const db = createDatabase(":memory:");
    try {
      expect(() => createApp({ db, config: { ...config(), stripeSecretKey: "sk_live_forbidden" } }))
        .to.throw("Live payments are disabled");
      const disabled = createApp({ db, config: { ...config(), stripeSecretKey: undefined } });
      db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin', 'unused', 'admin')").run();
      await request(disabled).post("/rewards/admin/funding").set(bearer(adminToken))
        .set("Idempotency-Key", "disabled").send({ amountCents: 1000 }).expect(503);
    } finally { db.close(); }
  });

  it("blocks public admin registration, unauthenticated callers, and non-admin financial operations", async function () {
    await api.post("/auth/register").send({ email: "attacker@example.com", password: "strongpass123", role: "admin" }).expect(403);
    await api.get("/rewards/admin/audit").expect(401);
    await api.get("/rewards/admin/audit").set("Authorization", "Bearer a.b.c").expect(401);
    await api.post("/rewards/admin/funding").set(bearer(userToken)).send({ amountCents: 1000 }).expect(403);
    await api.get("/rewards/admin/audit").set("x-partner-key", "not-user-auth").expect(401);
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM users").get().n).to.equal(3);
  });

  it("grants administrators only through the operator command and records the change", function () {
    expect(() => grantAdmin(app.locals.db, "")).to.throw("Usage:");
    expect(() => grantAdmin(app.locals.db, "missing@example.com")).to.throw("Register this user");
    expect(grantAdmin(app.locals.db, "CONTRIBUTOR@example.com")).to.equal(2);
    expect(app.locals.db.prepare("SELECT role FROM users WHERE id = 2").get().role).to.equal("admin");
    grantAdmin(app.locals.db, "contributor@example.com");
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_audit WHERE action = 'admin_granted_by_operator'").get().n).to.equal(1);
  });

  it("keeps UTC credits separate and clearly labels the public policy as test-only", async function () {
    const policy = await api.get("/rewards/policy").expect(200);
    expect(policy.body.mode).to.equal("test");
    expect(policy.body.cashValue).to.equal(false);
    app.locals.db.prepare(`INSERT INTO token_ledger
      (user_id, amount, reason, source_type, source_id, idempotency_key) VALUES (2, 999, 'test', 'test', '1', 'test')`).run();
    const me = await api.get("/rewards/me").set(bearer(userToken)).expect(200);
    expect(me.body.rewards).to.deep.equal([]);
    expect(me.body.totals).to.deep.equal([]);
  });

  it("validates amounts and keeps funding requests idempotent", async function () {
    for (const amountCents of [0, 99, -1, 100.5, "1000", 1000001]) {
      await api.post("/rewards/admin/funding").set(bearer(adminToken))
        .set("Idempotency-Key", "invalid").send({ amountCents }).expect(400);
    }
    await api.post("/rewards/admin/funding").set(bearer(adminToken)).send({ amountCents: 1000 }).expect(400);
    const pool = await funding(1000, false);
    const row = app.locals.db.prepare("SELECT * FROM cash_funding WHERE id = ?").get(pool.id);
    const repeat = await api.post("/rewards/admin/funding").set(bearer(adminToken))
      .set("Idempotency-Key", row.request_key).send({ amountCents: 1000 }).expect(201);
    expect(repeat.body.funding.id).to.equal(pool.id);
    expect(stripe.state.fundingCalls).to.have.length(1);
    await api.post("/rewards/admin/funding").set(bearer(adminToken))
      .set("Idempotency-Key", row.request_key).send({ amountCents: 2000 }).expect(409);
  });

  it("credits only signed, verified funding net of fees, once per event", async function () {
    const pool = await funding(1000, false);
    expect(app.locals.db.prepare("SELECT net_cents FROM cash_funding WHERE id = ?").get(pool.id).net_cents).to.equal(0);
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }, { id: "evt_once" }).expect(200);
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }, { id: "evt_once" }).expect(200);
    const row = app.locals.db.prepare("SELECT * FROM cash_funding WHERE id = ?").get(pool.id);
    expect(row.net_cents).to.equal(971);
    expect(row.status).to.equal("confirmed");
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_audit WHERE action = 'funding_confirmed'").get().n).to.equal(1);
  });

  it("rejects forged, altered, live, and mismatched funding events", async function () {
    await api.post("/rewards/stripe/webhook").set("Content-Type", "application/json")
      .set("stripe-signature", "forged").send("{}").expect(400);
    const original = "{}";
    await api.post("/rewards/stripe/webhook").set("Content-Type", "application/json")
      .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload: original, secret: WEBHOOK_SECRET }))
      .send('{"modified":true}').expect(400);
    const pool = await funding(1000, false);
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }, { livemode: true }).expect(400);
    const intent = await stripe.paymentIntents.retrieve(pool.payment_intent);
    intent.amount_received = 900;
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }).expect(409);
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("pending");
  });

  it("ignores unrelated payments and retries payments racing local persistence", async function () {
    await webhook("payment_intent.succeeded", { id: "pi_unrelated" }).expect(200);
    await webhook("payment_intent.succeeded", { id: "pi_pending", metadata: { cash_funding_id: "local-pending" } }).expect(409);
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_funding").get().n).to.equal(0);
  });

  it("requires HTTPS evidence and rejects listening, duplicate evidence, and unsupported kinds", async function () {
    const body = { title: "Resource", description: "Evidence to review", evidenceUrl: "https://example.com/proof", kind: "knowledge" };
    await api.post("/rewards/contributions").set(bearer(userToken)).send({ ...body, kind: "spotify" }).expect(400);
    await api.post("/rewards/contributions").set(bearer(userToken)).send({ ...body, evidenceUrl: "http://example.com" }).expect(400);
    await api.post("/rewards/contributions").set(bearer(userToken)).send({ ...body, evidenceUrl: "https://user:password@example.com" }).expect(400);
    await api.post("/rewards/contributions").set(bearer(userToken)).send(body).expect(201);
    await api.post("/rewards/contributions").set(bearer(secondToken)).send({ ...body, evidenceUrl: `${body.evidenceUrl}#duplicate` }).expect(409);
  });

  it("requires independent review, bounded points, and a recorded reason", async function () {
    const submitted = await api.post("/rewards/contributions").set(bearer(adminToken)).send({
      kind: "code", title: "Code change", description: "Description", evidenceUrl: "https://example.com/code"
    }).expect(201);
    await api.post(`/rewards/admin/contributions/${submitted.body.id}/review`).set(bearer(adminToken))
      .send({ decision: "approved", points: 1, reason: "Self review" }).expect(403);
    const id = await contribution();
    await api.post(`/rewards/admin/contributions/${id}/review`).set(bearer(adminToken))
      .send({ decision: "rejected", reason: "Changed mind" }).expect(409);
    for (const points of [0, 1001, 1.5, "10"]) {
      await api.post(`/rewards/admin/contributions/${submitted.body.id}/review`).set(bearer(adminToken))
        .send({ decision: "approved", points, reason: "Review" }).expect(400);
    }
    await api.post(`/rewards/admin/contributions/${submitted.body.id}/review`).set(bearer(adminToken))
      .send({ decision: "approved", points: 1 }).expect(400);
  });

  it("allocates proportional cents atomically without overspending or rewarding twice", async function () {
    const pool = await funding();
    const first = await contribution(userToken, 1);
    const second = await contribution(secondToken, 2);
    const allocations = await allocate(pool, [first, second]);
    expect(allocations.reduce((sum, row) => sum + row.amountCents, 0)).to.equal(971);
    expect(allocations.find((row) => row.userId === 2).amountCents).to.equal(324);
    expect(allocations.find((row) => row.userId === 3).amountCents).to.equal(647);
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [first] }).expect(409);
    const another = await funding();
    await api.post(`/rewards/admin/funding/${another.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [first] }).expect(409);
    expect(app.locals.db.prepare("SELECT allocated FROM cash_funding WHERE id = ?").get(another.id).allocated).to.equal(0);
  });

  it("rejects unconfirmed pools, unreviewed or rejected work, and duplicate selection", async function () {
    const pool = await funding(1000, false);
    const approved = await contribution();
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [approved] }).expect(409);
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }).expect(200);
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [approved, approved] }).expect(400);
    const pending = await api.post("/rewards/contributions").set(bearer(userToken)).send({
      kind: "translation", title: "Translation", description: "Sources included", evidenceUrl: "https://example.com/pending"
    }).expect(201);
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [approved, pending.body.id] }).expect(400);
    await api.post(`/rewards/admin/contributions/${pending.body.id}/review`).set(bearer(adminToken))
      .send({ decision: "rejected", reason: "Insufficient evidence" }).expect(200);
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [pending.body.id] }).expect(400);
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_rewards").get().n).to.equal(0);
  });

  it("conserves cents and deterministically breaks ties for different input orders", function () {
    const rows = [{ id: "c", points: 1 }, { id: "a", points: 1 }, { id: "b", points: 1 }];
    expect(splitCents(100, rows)).to.deep.equal(splitCents(100, [...rows].reverse()));
    expect(splitCents(100, rows).map((row) => row.cents)).to.deep.equal([34, 33, 33]);
    for (let amount = 100; amount < 400; amount++) {
      const shares = splitCents(amount, [{ id: "a", points: 1 }, { id: "b", points: 999 }]);
      expect(shares.reduce((sum, row) => sum + row.cents, 0)).to.equal(amount);
    }
  });

  it("uses server-controlled onboarding links and does not let users attach arbitrary accounts", async function () {
    const result = await api.post("/rewards/connect/onboard").set(bearer(userToken)).send({
      stripeAccount: "acct_attacker", returnUrl: "https://attacker.example"
    }).expect(200);
    expect(result.body.mode).to.equal("test");
    expect(stripe.state.linkCalls[0].return_url).to.equal("http://localhost:3000/rewards/connect/return");
    expect(stripe.state.accountCalls[0].params.type).to.equal("express");
    await api.post("/rewards/connect/onboard").set(bearer(userToken)).send({}).expect(200);
    expect(stripe.state.accountCalls).to.have.length(1);
    expect(stripe.state.accountCalls[0].options.idempotencyKey).to.include(
      app.locals.db.prepare("SELECT namespace FROM cash_installation").get().namespace
    );
    await api.get("/rewards/connect/return").expect(200);
    await api.get("/rewards/connect/refresh").expect(200);
  });

  it("rejects insecure onboarding redirects and malformed public URL configuration", async function () {
    for (const rewardsPublicUrl of ["http://attacker.example", "not-a-url"]) {
      const db = createDatabase(":memory:");
      try {
        const other = createApp({ db, stripe, config: { ...config(), rewardsPublicUrl } });
        db.prepare("INSERT INTO users (id, email, password_hash) VALUES (2, 'test@example.com', 'unused')").run();
        await request(other).post("/rewards/connect/onboard").set(bearer(userToken)).send({}).expect(503);
      } finally { db.close(); }
    }
    expect(stripe.state.accountCalls).to.have.length(0);
  });

  it("requires a payout-eligible account and exposes only the user's own rewards", async function () {
    const pool = await funding();
    const id = await contribution();
    const [reward] = await allocate(pool, [id]);
    await transfer(reward.id).expect(409);
    await api.post("/rewards/connect/onboard").set(bearer(userToken)).send({}).expect(200);
    stripe.state.eligible = false;
    await transfer(reward.id).expect(409);
    expect(stripe.state.transferCalls).to.have.length(0);
    const me = await api.get("/rewards/me").set(bearer(userToken)).expect(200);
    expect(me.body.connect.eligible).to.equal(false);
    expect(me.body.rewards).to.have.length(1);
    const other = await api.get("/rewards/me").set(bearer(secondToken)).expect(200);
    expect(other.body.rewards).to.deep.equal([]);
    expect(other.body.contributions).to.deep.equal([]);
  });

  it("transfers reserved cents once with a source charge and persistent idempotency key", async function () {
    const { reward, pool } = await preparedReward();
    const result = await transfer(reward.id).expect(200);
    expect(result.body.reward.status).to.equal("transferred");
    await transfer(reward.id).expect(200);
    expect(stripe.state.transferCalls).to.have.length(1);
    expect(stripe.state.transferCalls[0].params.amount).to.equal(971);
    expect(stripe.state.transferCalls[0].params.source_transaction).to.equal(`ch_${pool.payment_intent}`);
    expect(stripe.state.transferCalls[0].options.idempotencyKey).to.equal(`cash-transfer-${reward.id}`);
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_audit WHERE action = 'reward_transferred'").get().n).to.equal(1);
  });

  it("handles concurrent transfer requests without double movement", async function () {
    const { reward } = await preparedReward();
    await Promise.all([transfer(reward.id).expect(200), transfer(reward.id).expect(200)]);
    const keys = new Set(stripe.state.transferCalls.map((call) => call.options.idempotencyKey));
    expect(keys.size).to.equal(1);
    expect(app.locals.db.prepare("SELECT count(*) AS n FROM cash_audit WHERE action = 'reward_transferred'").get().n).to.equal(1);
  });

  it("keeps ambiguous failures reserved and safely retries the same Stripe operation", async function () {
    const { reward } = await preparedReward();
    stripe.state.failure = "after";
    await transfer(reward.id).expect(502);
    expect(app.locals.db.prepare("SELECT status FROM cash_rewards WHERE id = ?").get(reward.id).status).to.equal("processing");
    stripe.state.failure = null;
    const retried = await transfer(reward.id).expect(200);
    expect(retried.body.reward.transfer_id).to.equal("tr_1");
    expect(stripe.state.transferCalls[0].options).to.deep.equal(stripe.state.transferCalls[1].options);
  });

  it("does not retry expired idempotency keys and reconciles an existing transfer instead", async function () {
    const { reward } = await preparedReward();
    stripe.state.failure = "after";
    await transfer(reward.id).expect(502);
    app.locals.db.prepare("UPDATE cash_rewards SET processing_at = ? WHERE id = ?").run(Date.now() - 24 * 3600000, reward.id);
    stripe.state.failure = null;
    await transfer(reward.id).expect(409);
    const reconciled = await api.post(`/rewards/admin/rewards/${reward.id}/reconcile`).set(bearer(adminToken)).send({}).expect(200);
    expect(reconciled.body.reward.transfer_id).to.equal("tr_1");
    expect(stripe.state.transferCalls).to.have.length(1);
  });

  it("retains reservations when no transfer can be reconciled", async function () {
    const { reward } = await preparedReward();
    stripe.state.failure = "before";
    await transfer(reward.id).expect(502);
    await api.post(`/rewards/admin/rewards/${reward.id}/reconcile`).set(bearer(adminToken)).send({}).expect(409);
    expect(app.locals.db.prepare("SELECT status FROM cash_rewards WHERE id = ?").get(reward.id).status).to.equal("processing");
  });

  it("blocks refunds and disputes even when events arrive before funding confirmation", async function () {
    const pool = await funding(1000, false);
    const intent = await stripe.paymentIntents.retrieve(pool.payment_intent);
    await webhook("charge.dispute.created", { id: "dp_test", charge: intent.latest_charge.id }).expect(200);
    await webhook("payment_intent.succeeded", { id: pool.payment_intent }).expect(200);
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("blocked");
    const id = await contribution();
    await api.post(`/rewards/admin/funding/${pool.id}/allocate`).set(bearer(adminToken))
      .send({ contributionIds: [id] }).expect(409);
    const prepared = await preparedReward();
    await webhook("charge.refunded", { id: `ch_${prepared.pool.payment_intent}` }).expect(200);
    await transfer(prepared.reward.id).expect(409);
    expect(stripe.state.transferCalls).to.have.length(0);
  });

  it("checks Stripe for charge risk before transferring even if the webhook was missed", async function () {
    const { reward, pool } = await preparedReward();
    const intent = await stripe.paymentIntents.retrieve(pool.payment_intent);
    intent.latest_charge.amount_refunded = 1;
    await transfer(reward.id).expect(409);
    expect(stripe.state.transferCalls).to.have.length(0);
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("blocked");
  });

  it("records reversals and blocks resending or reusing the affected pool", async function () {
    const { reward, pool } = await preparedReward();
    const result = await transfer(reward.id).expect(200);
    await webhook("transfer.reversed", {
      id: result.body.reward.transfer_id, amount_reversed: 10, metadata: { cash_reward_id: reward.id }
    }).expect(200);
    expect(app.locals.db.prepare("SELECT status FROM cash_rewards WHERE id = ?").get(reward.id).status).to.equal("reversed");
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("blocked");
    await transfer(reward.id).expect(409);
    expect(stripe.state.transferCalls).to.have.length(1);
  });

  it("blocks and audits a pool when a lost transfer is reversed before reconciliation", async function () {
    const pool = await funding();
    const firstContribution = await contribution(userToken);
    const secondContribution = await contribution(secondToken);
    const [firstReward, secondReward] = await allocate(pool, [firstContribution, secondContribution]);
    await api.post("/rewards/connect/onboard").set(bearer(userToken)).send({}).expect(200);
    await api.post("/rewards/connect/onboard").set(bearer(secondToken)).send({}).expect(200);
    stripe.state.failure = "after";
    await transfer(firstReward.id).expect(502);
    stripe.state.failure = null;
    const [lostTransfer] = (await stripe.transfers.list({ transfer_group: `cash_reward_${firstReward.id}` })).data;
    lostTransfer.reversed = true;
    lostTransfer.amount_reversed = lostTransfer.amount;

    await webhook("transfer.reversed", {
      ...lostTransfer, amount: lostTransfer.amount + 1, metadata: { cash_reward_id: firstReward.id }
    }).expect(409);
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("confirmed");

    await webhook("transfer.reversed", {
      ...lostTransfer, metadata: { cash_reward_id: firstReward.id }
    }).expect(409);

    expect(app.locals.db.prepare("SELECT status FROM cash_rewards WHERE id = ?").get(firstReward.id).status).to.equal("processing");
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("blocked");
    expect(app.locals.db.prepare(
      "SELECT count(*) AS n FROM cash_audit WHERE action = 'funding_blocked' AND resource_id = ?"
    ).get(pool.id).n).to.equal(1);
    await transfer(secondReward.id).expect(409);
    expect(stripe.state.transferCalls).to.have.length(1);
  });

  it("reconciles a reversed transfer even when the original response was lost", async function () {
    const { reward } = await preparedReward();
    stripe.state.failure = "after";
    await transfer(reward.id).expect(502);
    const matches = await stripe.transfers.list({ transfer_group: `cash_reward_${reward.id}` });
    matches.data[0].amount_reversed = 10;
    await webhook("transfer.reversed", {
      id: matches.data[0].id, amount_reversed: 10, metadata: { cash_reward_id: reward.id }
    }).expect(409);
    const result = await api.post(`/rewards/admin/rewards/${reward.id}/reconcile`).set(bearer(adminToken)).send({}).expect(200);
    expect(result.body.reward.status).to.equal("reversed");
    await webhook("transfer.reversed", {
      id: matches.data[0].id, amount_reversed: 10, metadata: { cash_reward_id: reward.id }
    }).expect(200);
    await transfer(reward.id).expect(409);
  });

  it("applies a reversal found during reconciliation after the transfer ID was recorded", async function () {
    const { reward, pool } = await preparedReward();
    const result = await transfer(reward.id).expect(200);
    const [storedTransfer] = (await stripe.transfers.list({ transfer_group: `cash_reward_${reward.id}` })).data;
    storedTransfer.reversed = true;
    storedTransfer.amount_reversed = storedTransfer.amount;
    app.locals.db.prepare("UPDATE cash_rewards SET status = 'processing' WHERE id = ?").run(reward.id);

    const reconciled = await api.post(`/rewards/admin/rewards/${reward.id}/reconcile`)
      .set(bearer(adminToken)).send({}).expect(200);

    expect(reconciled.body.reward.transfer_id).to.equal(result.body.reward.transfer_id);
    expect(reconciled.body.reward.status).to.equal("reversed");
    expect(app.locals.db.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("blocked");
    expect(app.locals.db.prepare(
      "SELECT count(*) AS n FROM cash_audit WHERE action = 'transfer_reversed' AND resource_id = ?"
    ).get(reward.id).n).to.equal(1);
  });

  it("persists funding, reservations, destinations, and idempotent transfer state across restarts", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "covenant-rewards-"));
    const file = path.join(directory, "test.db");
    let persistentDb;
    try {
      app.locals.db.close();
      persistentDb = createDatabase(file);
      app = createApp({ db: persistentDb, config: config(), stripe });
      api = request(app);
      persistentDb.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin', 'unused', 'admin'), (2, 'user', 'unused', 'user')").run();
      const { reward, pool } = await preparedReward();
      const namespace = persistentDb.prepare("SELECT namespace FROM cash_installation").get().namespace;
      stripe.state.failure = "after";
      await transfer(reward.id).expect(502);
      persistentDb.close();
      persistentDb = createDatabase(file);
      app = createApp({ db: persistentDb, config: config(), stripe });
      api = request(app);
      expect(persistentDb.prepare("SELECT namespace FROM cash_installation").get().namespace).to.equal(namespace);
      expect(persistentDb.prepare("SELECT status FROM cash_funding WHERE id = ?").get(pool.id).status).to.equal("confirmed");
      expect(persistentDb.prepare("SELECT status FROM cash_rewards WHERE id = ?").get(reward.id).status).to.equal("processing");
      stripe.state.failure = null;
      const result = await transfer(reward.id).expect(200);
      expect(result.body.reward.transfer_id).to.equal("tr_1");
      expect(stripe.state.transferCalls[0].options).to.deep.equal(stripe.state.transferCalls[1].options);
    } finally {
      if (persistentDb?.open) persistentDb.close();
      for (const name of ["test.db", "test.db-wal", "test.db-shm"]) {
        const target = path.join(directory, name);
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      fs.rmdirSync(directory);
    }
  });

  it("makes financial audit entries append-only and available only to administrators", async function () {
    await funding();
    const result = await api.get("/rewards/admin/audit").set(bearer(adminToken)).expect(200);
    expect(result.body.entries.map((row) => row.action)).to.include("funding_confirmed");
    expect(() => app.locals.db.prepare("UPDATE cash_audit SET action = 'tampered'").run()).to.throw("append-only");
    expect(() => app.locals.db.prepare("DELETE FROM cash_audit").run()).to.throw("append-only");
    await api.get("/rewards/admin/audit").set(bearer(userToken)).expect(403);
  });
});
