"use strict";

const crypto = require("crypto");
const express = require("express");
const Stripe = require("stripe");
const { AppError, badRequest, forbidden, notFound } = require("./errors");
const { initializeRewardsDatabase } = require("./rewards-db");

const conflict = (message) => new AppError(409, "REWARD_CONFLICT", message);

function positiveInteger(value, name, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw badRequest(`${name} must be an integer between 1 and ${max}.`);
  }
  return value;
}

function text(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw badRequest(`${name} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

// Largest remainders conserve every cent; IDs break ties deterministically.
function splitCents(amount, contributions) {
  const total = contributions.reduce((sum, row) => sum + BigInt(row.points), 0n);
  const shares = contributions.map((row) => {
    const product = BigInt(amount) * BigInt(row.points);
    return { ...row, cents: Number(product / total), remainder: product % total };
  }).sort((a, b) => a.remainder === b.remainder
    ? a.id.localeCompare(b.id)
    : a.remainder > b.remainder ? -1 : 1);
  const leftover = amount - shares.reduce((sum, row) => sum + row.cents, 0);
  shares.forEach((row, index) => { if (index < leftover) row.cents += 1; });
  return shares;
}

function createRewards({ db, config, stripe: injectedStripe, authRequired, adminRequired }) {
  initializeRewardsDatabase(db);
  const namespace = db.prepare("SELECT namespace FROM cash_installation WHERE id = 1").get().namespace;
  if (config.stripeSecretKey && !config.stripeSecretKey.startsWith("sk_test_")) {
    throw new Error("Funded rewards only accept a Stripe sk_test_ key. Live payments are disabled.");
  }
  const stripe = injectedStripe || (config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey, { maxNetworkRetries: 2, timeout: 15000 })
    : null);
  const router = express.Router();
  const audit = (actor, action, id, detail) => db.prepare(
    "INSERT INTO cash_audit (actor_id, action, resource_id, detail) VALUES (?, ?, ?, ?)"
  ).run(actor, action, id, JSON.stringify(detail));
  const fundingById = (id) => {
    const row = db.prepare("SELECT * FROM cash_funding WHERE id = ?").get(id);
    if (!row) throw notFound("Funding pool not found.");
    return row;
  };
  const requireProvider = () => {
    if (!stripe) throw new AppError(503, "REWARDS_DISABLED", "Configure Stripe test mode to enable funded rewards.");
  };
  async function providerCall(fn) {
    try {
      return await fn();
    } catch (error) {
      console.error("Stripe test-mode request failed", { type: error.type, code: error.code });
      throw new AppError(502, "STRIPE_ERROR", "Stripe request failed. Retry the same operation, not a new funding request.");
    }
  }
  function onboardingUrls() {
    let base;
    try {
      base = new URL(config.rewardsPublicUrl);
    } catch (_error) {
      throw new AppError(503, "REWARDS_CONFIG", "REWARDS_PUBLIC_URL must be a valid absolute URL.");
    }
    if (base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
      throw new AppError(503, "REWARDS_CONFIG", "REWARDS_PUBLIC_URL must use HTTPS (HTTP is allowed only on localhost).");
    }
    return {
      refresh_url: new URL("/rewards/connect/refresh", base).href,
      return_url: new URL("/rewards/connect/return", base).href
    };
  }

  async function webhook(req, res) {
    requireProvider();
    if (!config.stripeWebhookSecret) {
      throw new AppError(503, "REWARDS_CONFIG", "Stripe webhook secret is not configured.");
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], config.stripeWebhookSecret);
    } catch (_error) {
      throw badRequest("Invalid Stripe webhook signature.");
    }
    if (event.livemode !== false) throw badRequest("Only Stripe test-mode events are accepted.");
    if (db.prepare("SELECT 1 FROM cash_webhook_events WHERE id = ?").get(event.id)) {
      return res.json({ received: true });
    }

    let confirmation;
    if (event.type === "payment_intent.succeeded") {
      const local = db.prepare("SELECT * FROM cash_funding WHERE payment_intent = ?").get(event.data.object.id);
      // Unrelated payments on the same Stripe account must not fund rewards.
      if (local) {
        const intent = await providerCall(() => stripe.paymentIntents.retrieve(local.payment_intent, {
          expand: ["latest_charge.balance_transaction"]
        }));
        const charge = intent.latest_charge;
        const balance = charge && charge.balance_transaction;
        if (intent.livemode !== false || intent.status !== "succeeded" ||
          intent.currency !== "usd" || intent.amount_received !== local.amount_cents ||
          !charge || typeof charge !== "object" || charge.paid !== true ||
          charge.amount !== local.amount_cents || charge.currency !== "usd" ||
          !balance || typeof balance !== "object" || balance.currency !== "usd" ||
          !Number.isSafeInteger(balance.net) || balance.net <= 0 || balance.net > local.amount_cents) {
          throw conflict("Funding is not ready or does not match the recorded amount and currency.");
        }
        confirmation = { local, charge, net: balance.net };
      } else if (event.data.object.metadata?.cash_funding_id) {
        throw conflict("Funding creation is still pending; Stripe should retry this event.");
      }
    }
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM cash_webhook_events WHERE id = ?").get(event.id)) return;
      if (confirmation) {
        const { local, charge, net } = confirmation;
        if (local.charge_id && (local.charge_id !== charge.id || local.net_cents !== net)) {
          throw conflict("Confirmed funding cannot change charge or net amount. Manual reconciliation is required.");
        }
        const risk = db.prepare("SELECT 1 FROM cash_risk_charges WHERE charge_id = ?").get(charge.id);
        const status = risk || charge.refunded || charge.amount_refunded > 0 || charge.disputed ? "blocked" : "confirmed";
        db.prepare(`UPDATE cash_funding SET charge_id = ?, net_cents = ?,
          status = CASE WHEN status = 'blocked' THEN 'blocked' ELSE ? END WHERE id = ?`)
          .run(charge.id, net, status, local.id);
        audit(null, "funding_confirmed", local.id, { eventId: event.id, netCents: net, status });
      }
      if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
        const object = event.data.object;
        const chargeId = event.type === "charge.refunded" ? object.id : object.charge;
        if (typeof chargeId !== "string") throw badRequest("Risk event must reference a charge.");
        db.prepare("INSERT OR IGNORE INTO cash_risk_charges (charge_id, event_id) VALUES (?, ?)").run(chargeId, event.id);
        db.prepare("UPDATE cash_funding SET status = 'blocked' WHERE charge_id = ?").run(chargeId);
        audit(null, "funding_blocked", chargeId, { eventId: event.id, type: event.type });
      }
      if (event.type === "transfer.reversed") {
        const transfer = event.data.object;
        const reward = db.prepare("SELECT * FROM cash_rewards WHERE transfer_id = ?").get(transfer.id);
        if (reward) {
          db.prepare("UPDATE cash_rewards SET status = 'reversed' WHERE id = ?").run(reward.id);
          db.prepare("UPDATE cash_funding SET status = 'blocked' WHERE id = ?").run(reward.funding_id);
          audit(null, "transfer_reversed", reward.id, { eventId: event.id, amountReversed: transfer.amount_reversed });
        } else if (transfer.metadata?.cash_reward_id) {
          // A transfer response may have been lost before its ID was persisted.
          throw conflict("Reconcile the original transfer before processing its reversal.");
        }
      }
      db.prepare("INSERT INTO cash_webhook_events (id, type) VALUES (?, ?)").run(event.id, event.type);
    }).immediate();
    return res.json({ received: true });
  }

  router.get("/connect/return", (_req, res) => res.type("text").send(
    "Stripe onboarding returned. This does not confirm eligibility. Check GET /rewards/me with your bearer token."
  ));
  router.get("/connect/refresh", (_req, res) => res.type("text").send(
    "Your Stripe onboarding link expired. Sign in and request a new link with POST /rewards/connect/onboard."
  ));
  router.get("/policy", (_req, res) => res.json({
    mode: "test",
    currency: "usd",
    cashValue: false,
    allocation: "Verified contribution points, proportional split of a single pool after Stripe processing fees.",
    review: "Independent administrator review is required; AI and partner APIs cannot approve or transfer money.",
    exclusions: ["YouTube or Spotify stream counts", "UTC credit conversion", "guaranteed income"],
    settlement: "Transfers go to a connected Stripe test balance, not directly to a bank account."
  }));
  router.use(authRequired);

  router.post("/connect/onboard", async (req, res) => {
    requireProvider();
    const urls = onboardingUrls();
    let account = db.prepare("SELECT stripe_account FROM cash_accounts WHERE user_id = ?").get(req.user.id);
    if (!account) {
      const created = await providerCall(() => stripe.accounts.create({
        type: "express", country: "US", email: req.user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { cash_user_id: String(req.user.id), cash_installation: namespace }
      }, { idempotencyKey: `cash-account-${namespace}-${req.user.id}` }));
      db.prepare("INSERT OR IGNORE INTO cash_accounts (user_id, stripe_account) VALUES (?, ?)").run(req.user.id, created.id);
      account = db.prepare("SELECT stripe_account FROM cash_accounts WHERE user_id = ?").get(req.user.id);
    }
    const link = await providerCall(() => stripe.accountLinks.create({
      account: account.stripe_account, type: "account_onboarding", ...urls
    }));
    res.json({ url: link.url, expiresAt: link.expires_at, mode: "test" });
  });

  router.post("/contributions", (req, res) => {
    const { kind } = req.body || {};
    if (!["knowledge", "code", "translation", "community"].includes(kind)) {
      throw badRequest("kind must be knowledge, code, translation, or community. Listening is not eligible for cash rewards.");
    }
    const title = text(req.body.title, "title", 160);
    const description = text(req.body.description, "description", 5000);
    let evidence;
    try {
      evidence = new URL(text(req.body.evidenceUrl, "evidenceUrl", 2000));
    } catch (_error) {
      throw badRequest("evidenceUrl must be a valid HTTPS URL.");
    }
    if (evidence.protocol !== "https:" || evidence.username || evidence.password) {
      throw badRequest("evidenceUrl must use HTTPS without embedded credentials.");
    }
    evidence.hash = "";
    const id = crypto.randomUUID();
    db.transaction(() => {
      if (db.prepare("SELECT 1 FROM cash_contributions WHERE evidence_url = ?").get(evidence.href)) {
        throw conflict("This evidence URL has already been submitted.");
      }
      db.prepare(`INSERT INTO cash_contributions (id, user_id, kind, title, evidence_url, description)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.user.id, kind, title, evidence.href, description);
      audit(req.user.id, "contribution_submitted", id, { kind, evidenceUrl: evidence.href });
    }).immediate();
    res.status(201).json({ id, status: "pending" });
  });

  router.get("/me", async (req, res) => {
    const contributions = db.prepare("SELECT * FROM cash_contributions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(req.user.id);
    const rewards = db.prepare(`SELECT r.*, f.status AS funding_status FROM cash_rewards r
      JOIN cash_funding f ON f.id = r.funding_id WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 100`).all(req.user.id);
    const totals = db.prepare(`SELECT status, SUM(amount_cents) AS cents FROM cash_rewards
      WHERE user_id = ? GROUP BY status`).all(req.user.id);
    const local = db.prepare("SELECT stripe_account FROM cash_accounts WHERE user_id = ?").get(req.user.id);
    let connect = { onboarded: false, eligible: false };
    if (local) {
      requireProvider();
      const account = await providerCall(() => stripe.accounts.retrieve(local.stripe_account));
      connect = { onboarded: account.details_submitted === true,
        eligible: account.details_submitted === true && account.payouts_enabled === true && account.capabilities?.transfers === "active" };
    }
    res.json({ mode: "test", currency: "usd", connect, contributions, rewards, totals });
  });

  router.use(adminRequired);
  router.get("/admin/contributions", (req, res) => {
    const status = req.query.status || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) throw badRequest("Invalid contribution status.");
    res.json({ contributions: db.prepare("SELECT * FROM cash_contributions WHERE status = ? ORDER BY created_at, id LIMIT 100").all(status) });
  });
  router.post("/admin/contributions/:id/review", (req, res) => {
    const { decision, points } = req.body || {};
    if (!["approved", "rejected"].includes(decision)) throw badRequest("decision must be approved or rejected.");
    const reason = text(req.body.reason, "reason", 2000);
    const verifiedPoints = decision === "approved" ? positiveInteger(points, "points", 1000) : 0;
    db.transaction(() => {
      const row = db.prepare("SELECT * FROM cash_contributions WHERE id = ?").get(req.params.id);
      if (!row) throw notFound("Contribution not found.");
      if (row.user_id === req.user.id) throw forbidden("You cannot review your own contribution.");
      if (row.status !== "pending") throw conflict("Contribution has already been reviewed.");
      db.prepare(`UPDATE cash_contributions SET status = ?, points = ?, reviewer_id = ?, review_reason = ? WHERE id = ?`)
        .run(decision, verifiedPoints, req.user.id, reason, row.id);
      audit(req.user.id, "contribution_reviewed", row.id, { decision, points: verifiedPoints, reason });
    }).immediate();
    res.json({ id: req.params.id, status: decision, points: verifiedPoints });
  });

  router.post("/admin/funding", async (req, res) => {
    requireProvider();
    const amount = positiveInteger(req.body?.amountCents, "amountCents", 1000000);
    if (amount < 100) throw badRequest("Funding must be at least 100 cents.");
    const key = text(req.headers["idempotency-key"], "Idempotency-Key header", 100);
    let row = db.transaction(() => {
      const existing = db.prepare("SELECT * FROM cash_funding WHERE request_key = ?").get(key);
      if (existing) {
        if (existing.amount_cents !== amount || existing.sponsor_id !== req.user.id) {
          throw conflict("Idempotency key was already used with a different funding request.");
        }
        return existing;
      }
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO cash_funding (id, request_key, sponsor_id, amount_cents) VALUES (?, ?, ?, ?)")
        .run(id, key, req.user.id, amount);
      audit(req.user.id, "funding_requested", id, { amountCents: amount });
      return fundingById(id);
    }).immediate();
    if (!row.payment_intent && Date.now() - Date.parse(`${row.created_at.replace(" ", "T")}Z`) > 23 * 3600000) {
      throw conflict("Funding request needs manual Stripe reconciliation before it can be retried.");
    }
    const intent = row.payment_intent
      ? await providerCall(() => stripe.paymentIntents.retrieve(row.payment_intent))
      : await providerCall(() => stripe.paymentIntents.create({
        amount, currency: "usd", payment_method_types: ["card"],
        metadata: { cash_funding_id: row.id }
      }, { idempotencyKey: `cash-funding-${row.id}` }));
    if (intent.livemode !== false) throw conflict("Stripe returned a live-mode PaymentIntent.");
    db.prepare("UPDATE cash_funding SET payment_intent = ? WHERE id = ?").run(intent.id, row.id);
    row = fundingById(row.id);
    res.status(201).json({ funding: row, clientSecret: intent.client_secret, mode: "test" });
  });
  router.get("/admin/funding", (_req, res) => {
    res.json({ funding: db.prepare("SELECT * FROM cash_funding ORDER BY created_at DESC LIMIT 100").all() });
  });
  router.get("/admin/rewards", (_req, res) => {
    res.json({ rewards: db.prepare("SELECT * FROM cash_rewards ORDER BY created_at DESC LIMIT 100").all() });
  });

  router.post("/admin/funding/:id/allocate", (req, res) => {
    const ids = req.body?.contributionIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
      ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      throw badRequest("contributionIds must contain 1 to 100 distinct contribution IDs.");
    }
    const rewards = db.transaction(() => {
      const pool = fundingById(req.params.id);
      if (pool.status !== "confirmed" || pool.allocated) throw conflict("Funding must be confirmed and not already allocated.");
      const contributions = ids.map((id) => {
        const contribution = db.prepare("SELECT * FROM cash_contributions WHERE id = ?").get(id);
        if (!contribution || contribution.status !== "approved" || contribution.points < 1) {
          throw badRequest("Every contribution must be independently approved with positive points.");
        }
        if (db.prepare("SELECT 1 FROM cash_rewards WHERE contribution_id = ?").get(id)) {
          throw conflict("A contribution has already received an allocation.");
        }
        return contribution;
      });
      const shares = splitCents(pool.net_cents, contributions);
      if (shares.some((row) => row.cents < 1)) throw badRequest("Pool is too small to allocate at least one cent per contribution.");
      const allocated = shares.map((row) => {
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO cash_rewards (id, funding_id, contribution_id, user_id, amount_cents)
          VALUES (?, ?, ?, ?, ?)`).run(id, pool.id, row.id, row.user_id, row.cents);
        return { id, contributionId: row.id, userId: row.user_id, amountCents: row.cents };
      });
      db.prepare("UPDATE cash_funding SET allocated = 1 WHERE id = ?").run(pool.id);
      audit(req.user.id, "pool_allocated", pool.id, { rewards: allocated });
      return allocated;
    }).immediate();
    res.status(201).json({ mode: "test", currency: "usd", rewards });
  });

  function rewardById(id) {
    const reward = db.prepare("SELECT * FROM cash_rewards WHERE id = ?").get(id);
    if (!reward) throw notFound("Reward not found.");
    return reward;
  }
  function recordTransfer(reward, transfer, actor) {
    if (transfer.livemode !== false || transfer.amount !== reward.amount_cents ||
      transfer.currency !== "usd" || transfer.destination !== reward.destination ||
      transfer.source_transaction !== fundingById(reward.funding_id).charge_id ||
      transfer.transfer_group !== `cash_reward_${reward.id}`) {
      throw conflict("Stripe transfer does not match the reserved reward; manual reconciliation is required.");
    }
    db.transaction(() => {
      const current = rewardById(reward.id);
      if (current.transfer_id && current.transfer_id !== transfer.id) throw conflict("Conflicting transfer ID.");
      if (!current.transfer_id) {
        const reversed = transfer.reversed || transfer.amount_reversed > 0;
        db.prepare("UPDATE cash_rewards SET status = ?, transfer_id = ? WHERE id = ?")
          .run(reversed ? "reversed" : "transferred", transfer.id, reward.id);
        if (reversed) db.prepare("UPDATE cash_funding SET status = 'blocked' WHERE id = ?").run(reward.funding_id);
        audit(actor, reversed ? "transfer_reversed" : "reward_transferred", reward.id, { transferId: transfer.id, destination: reward.destination });
      }
    }).immediate();
    return rewardById(reward.id);
  }
  router.post("/admin/rewards/:id/transfer", async (req, res) => {
    requireProvider();
    let reward = rewardById(req.params.id);
    if (reward.status === "transferred") return res.json({ reward, mode: "test" });
    if (reward.status === "reversed") throw conflict("Transfer was reversed. Manual reconciliation is required; this reward cannot be resent.");
    const account = db.prepare("SELECT stripe_account FROM cash_accounts WHERE user_id = ?").get(reward.user_id);
    if (!account) throw conflict("Contributor must complete Stripe Connect onboarding first.");
    const connected = await providerCall(() => stripe.accounts.retrieve(account.stripe_account));
    if (!connected.details_submitted || !connected.payouts_enabled || connected.capabilities?.transfers !== "active") {
      throw conflict("Connected account is not eligible for transfers and payouts.");
    }
    const pool = fundingById(reward.funding_id);
    const charge = await providerCall(() => stripe.charges.retrieve(pool.charge_id));
    if (charge.livemode !== false || charge.refunded || charge.amount_refunded > 0 || charge.disputed) {
      db.transaction(() => {
        db.prepare("UPDATE cash_funding SET status = 'blocked' WHERE id = ?").run(pool.id);
        audit(req.user.id, "funding_blocked", pool.id, { reason: "Charge is refunded, disputed, or not test-mode." });
      }).immediate();
      throw conflict("Funding charge is not eligible. Pool has been blocked for investigation.");
    }
    reward = db.transaction(() => {
      const current = rewardById(reward.id);
      if (fundingById(current.funding_id).status !== "confirmed") throw conflict("Funding is blocked or unconfirmed.");
      if (current.status === "transferred") return current;
      if (current.status === "processing") {
        if (Date.now() - current.processing_at > 23 * 3600000) {
          throw conflict("Transfer is unresolved past the safe retry window. Use the reconcile endpoint; do not create another transfer.");
        }
        if (current.destination !== account.stripe_account) throw conflict("Transfer destination has changed.");
        return current;
      }
      db.prepare(`UPDATE cash_rewards SET status = 'processing', destination = ?, processing_at = ? WHERE id = ?`)
        .run(account.stripe_account, Date.now(), current.id);
      audit(req.user.id, "transfer_requested", current.id, { destination: account.stripe_account });
      return rewardById(current.id);
    }).immediate();
    if (reward.status === "transferred") return res.json({ reward, mode: "test" });
    const transfer = await providerCall(() => stripe.transfers.create({
      amount: reward.amount_cents, currency: "usd", destination: reward.destination,
      source_transaction: fundingById(reward.funding_id).charge_id,
      transfer_group: `cash_reward_${reward.id}`,
      metadata: { cash_reward_id: reward.id }
    }, { idempotencyKey: `cash-transfer-${reward.id}` }));
    return res.json({ reward: recordTransfer(reward, transfer, req.user.id), mode: "test" });
  });
  router.post("/admin/rewards/:id/reconcile", async (req, res) => {
    requireProvider();
    const reward = rewardById(req.params.id);
    if (reward.status !== "processing") throw conflict("Only unresolved processing transfers need reconciliation.");
    const matches = await providerCall(() => stripe.transfers.list({ transfer_group: `cash_reward_${reward.id}`, limit: 100 }));
    if (matches.data.length !== 1 || matches.has_more) {
      throw conflict("No unique Stripe transfer found. Keep funds reserved and investigate in Stripe; do not reset or resend this reward.");
    }
    res.json({ reward: recordTransfer(reward, matches.data[0], req.user.id), mode: "test" });
  });
  router.get("/admin/audit", (_req, res) => {
    res.json({ entries: db.prepare("SELECT * FROM cash_audit ORDER BY id DESC LIMIT 100").all() });
  });
  return { router, webhook };
}

module.exports = { createRewards, splitCents };
