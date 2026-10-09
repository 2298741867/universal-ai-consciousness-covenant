"use strict";

const crypto = require("crypto");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const sharp = require("sharp");
const { validateAICPMessage } = require("../../core/aicp-protocol");
const { getConfig } = require("./config");
const { createDatabase } = require("./db");
const { hashPassword, verifyPassword, signJwt, verifyJwt, generateOpaqueKey, hashApiKey, verifyApiKey } = require("./auth");
const { AppError, badRequest, unauthorized, forbidden, notFound } = require("./errors");

const FORBIDDEN_PARTNER_SCOPES = new Set([
  "tokens:mint",
  "tokens:burn",
  "admin:write",
  "balances:read",
  "pii:read"
]);

const DEFAULT_PARTNER_SCOPES = ["tracks:read", "posts:read"];
const ALLOWED_PARTNER_SCOPES = new Set(["tracks:read", "posts:read", "aicp:validate"]);

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createApp(options = {}) {
  const config = options.config || getConfig();
  const db = options.db || createDatabase(options.dbPath || config.dbPath);
  const app = express();
  // Trust one proxy hop (e.g. Codespaces / cloud load balancer) so rate
  // limiting sees the real client IP from X-Forwarded-For.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "8mb" }));

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false
  });
  const partnerLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: true,
    legacyHeaders: false
  });
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use(globalLimiter);
  app.use("/auth", authLimiter);
  app.use("/partner", partnerLimiter);
  app.use("/admin", adminLimiter);

  function errorIf(condition, message, details) {
    if (condition) {
      throw badRequest(message, details);
    }
  }

  function safeParseInt(value, name) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw badRequest(`${name} must be a positive integer.`);
    }
    return parsed;
  }

  function authRequired(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : header || null;
    if (!token) {
      return next(unauthorized("Authorization bearer token is required."));
    }
    const payload = verifyJwt(token, config.jwtSecret);
    if (!payload || !payload.sub) {
      return next(unauthorized("Invalid token."));
    }
    const user = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(payload.sub);
    if (!user) {
      return next(unauthorized("User no longer exists."));
    }
    req.user = user;
    return next();
  }

  function requireRole(role) {
    return (req, _res, next) => {
      if (!req.user || req.user.role !== role) {
        return next(forbidden("Admin role required."));
      }
      return next();
    };
  }

  function auditPartner(partnerId, partnerKeyId, route, scope, outcome, detail) {
    db.prepare(
      "INSERT INTO partner_audit_logs (partner_id, partner_key_id, route, scope, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(partnerId || null, partnerKeyId || null, route, scope || null, outcome, detail || null);
  }

  function partnerRequired(scope) {
    return (req, _res, next) => {
      const apiKey = req.headers["x-partner-key"];
      if (!apiKey || typeof apiKey !== "string") {
        auditPartner(null, null, req.path, scope, "denied", "missing api key");
        return next(unauthorized("x-partner-key is required."));
      }

      const candidates = db.prepare(`
        SELECT k.id, k.partner_id, k.key_hash, k.expires_at, k.revoked_at, p.status
        FROM partner_keys k
        JOIN partners p ON p.id = k.partner_id
      `).all();

      const keyRow = candidates.find((row) => verifyApiKey(apiKey, row.key_hash));
      if (!keyRow) {
        auditPartner(null, null, req.path, scope, "denied", "invalid api key");
        return next(unauthorized("Invalid partner key."));
      }
      if (keyRow.revoked_at) {
        auditPartner(keyRow.partner_id, keyRow.id, req.path, scope, "denied", "revoked key");
        return next(forbidden("Partner key revoked."));
      }
      if (keyRow.status !== "active") {
        auditPartner(keyRow.partner_id, keyRow.id, req.path, scope, "denied", "partner not active");
        return next(forbidden("Partner is not active."));
      }
      if (new Date(keyRow.expires_at).getTime() < Date.now()) {
        auditPartner(keyRow.partner_id, keyRow.id, req.path, scope, "denied", "expired key");
        return next(forbidden("Partner key expired."));
      }

      const hasScope = db.prepare(
        "SELECT 1 FROM partner_scopes WHERE partner_id = ? AND scope = ?"
      ).get(keyRow.partner_id, scope);
      if (!hasScope) {
        auditPartner(keyRow.partner_id, keyRow.id, req.path, scope, "denied", "missing scope");
        return next(forbidden("Insufficient partner scope."));
      }

      req.partner = keyRow;
      req.partnerScope = scope;
      return next();
    };
  }

  function issueUtc(userId, amount, reason, sourceType, sourceId, idempotencyKey) {
    const existing = db.prepare(
      "SELECT id FROM token_ledger WHERE idempotency_key = ?"
    ).get(idempotencyKey);
    if (existing) {
      return false;
    }
    db.prepare(`
      INSERT INTO token_ledger (user_id, amount, reason, source_type, source_id, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, amount, reason, sourceType, String(sourceId), idempotencyKey);
    return true;
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "bringin-it-home-api" });
  });

  app.post("/auth/register", (req, res, next) => {
    try {
      const { email, password, role } = req.body || {};
      errorIf(!email || typeof email !== "string", "email is required");
      errorIf(!password || typeof password !== "string" || password.length < 8, "password must be at least 8 characters");
      if (role && !["user", "admin"].includes(role)) {
        throw badRequest("role must be user or admin");
      }
      const passwordHash = hashPassword(password);
      const stmt = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)");
      const result = stmt.run(email.toLowerCase().trim(), passwordHash, role || "user");
      res.status(201).json({ id: result.lastInsertRowid, email: email.toLowerCase().trim(), role: role || "user" });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return next(badRequest("email already exists"));
      }
      return next(error);
    }
    return null;
  });

  app.post("/auth/login", (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      errorIf(!email || !password, "email and password are required");
      const user = db.prepare("SELECT id, email, role, password_hash FROM users WHERE email = ?").get(String(email).toLowerCase().trim());
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw unauthorized("Invalid credentials.");
      }
      const token = signJwt({ sub: user.id, role: user.role }, config.jwtSecret, 60 * 60 * 24);
      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tracks", authRequired, (req, res, next) => {
    try {
      const { title, artistName } = req.body || {};
      errorIf(!title || typeof title !== "string", "title is required");
      const result = db.prepare(
        "INSERT INTO tracks (user_id, title, artist_name) VALUES (?, ?, ?)"
      ).run(req.user.id, title.trim(), artistName || req.user.email);
      const track = db.prepare("SELECT id, title, artist_name AS artistName, created_at AS createdAt FROM tracks WHERE id = ?").get(result.lastInsertRowid);
      res.status(201).json(track);
    } catch (error) {
      next(error);
    }
  });

  app.get("/tracks/:id", authRequired, (req, res, next) => {
    try {
      const id = safeParseInt(req.params.id, "track id");
      const track = db.prepare("SELECT id, title, artist_name AS artistName, created_at AS createdAt FROM tracks WHERE id = ?").get(id);
      if (!track) {
        throw notFound("Track not found.");
      }
      res.json(track);
    } catch (error) {
      next(error);
    }
  });

  app.post("/tracks/:id/listen/start", authRequired, (req, res, next) => {
    try {
      const trackId = safeParseInt(req.params.id, "track id");
      const track = db.prepare("SELECT id FROM tracks WHERE id = ?").get(trackId);
      if (!track) {
        throw notFound("Track not found.");
      }
      const result = db.prepare(
        "INSERT INTO listen_sessions (user_id, track_id) VALUES (?, ?)"
      ).run(req.user.id, trackId);
      res.status(201).json({ listenSessionId: result.lastInsertRowid });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tracks/:id/listen/heartbeat", authRequired, (req, res, next) => {
    try {
      const trackId = safeParseInt(req.params.id, "track id");
      const { listenSessionId } = req.body || {};
      const sessionId = safeParseInt(listenSessionId, "listenSessionId");
      const session = db.prepare(
        "SELECT id, user_id, track_id, ended_at FROM listen_sessions WHERE id = ?"
      ).get(sessionId);
      if (!session || session.user_id !== req.user.id || session.track_id !== trackId) {
        throw notFound("Listen session not found.");
      }
      if (session.ended_at) {
        throw badRequest("Listen session already ended.");
      }
      db.prepare("INSERT INTO listen_heartbeats (listen_session_id) VALUES (?)").run(sessionId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/tracks/:id/listen/end", authRequired, (req, res, next) => {
    try {
      const trackId = safeParseInt(req.params.id, "track id");
      const { listenSessionId, idempotencyKey } = req.body || {};
      const sessionId = safeParseInt(listenSessionId, "listenSessionId");
      errorIf(!idempotencyKey || typeof idempotencyKey !== "string", "idempotencyKey is required");

      const session = db.prepare(`
        SELECT s.id, s.user_id, s.track_id, s.started_at, s.ended_at, s.rewarded, t.user_id AS artist_user_id
        FROM listen_sessions s
        JOIN tracks t ON t.id = s.track_id
        WHERE s.id = ?
      `).get(sessionId);
      if (!session || session.user_id !== req.user.id || session.track_id !== trackId) {
        throw notFound("Listen session not found.");
      }

      if (!session.ended_at) {
        db.prepare("UPDATE listen_sessions SET ended_at = datetime('now') WHERE id = ?").run(sessionId);
      }

      const refreshed = db.prepare("SELECT started_at, ended_at, rewarded FROM listen_sessions WHERE id = ?").get(sessionId);
      const elapsedSeconds = Math.max(0, Math.floor((new Date(refreshed.ended_at).getTime() - new Date(refreshed.started_at).getTime()) / 1000));
      const heartbeatCount = db.prepare("SELECT COUNT(1) AS count FROM listen_heartbeats WHERE listen_session_id = ?").get(sessionId).count;
      const rewardedRecently = db.prepare(`
        SELECT 1
        FROM token_ledger
        WHERE user_id = ?
          AND reason = 'listen_reward'
          AND source_type = 'track'
          AND source_id = ?
          AND created_at >= datetime('now', '-1 day')
        LIMIT 1
      `).get(req.user.id, String(trackId));

      const eligible =
        elapsedSeconds >= 30 &&
        heartbeatCount >= 3 &&
        !rewardedRecently &&
        Number(session.artist_user_id) !== Number(req.user.id);

      const run = db.transaction(() => {
        if (!eligible) {
          return { rewarded: false, reason: "not eligible" };
        }
        const listenerIssued = issueUtc(
          req.user.id,
          config.listenerRewardUtc,
          "listen_reward",
          "track",
          trackId,
          `listen:${sessionId}:${idempotencyKey}:listener`
        );
        const artistIssued = issueUtc(
          session.artist_user_id,
          config.artistRewardUtc,
          "artist_listen_share",
          "track",
          trackId,
          `listen:${sessionId}:${idempotencyKey}:artist`
        );
        if (listenerIssued || artistIssued) {
          db.prepare("UPDATE listen_sessions SET rewarded = 1, reward_idempotency_key = ? WHERE id = ?").run(idempotencyKey, sessionId);
        }
        return { rewarded: listenerIssued || artistIssued, reason: "rewarded" };
      });

      const rewardResult = run();
      res.json({
        listenSessionId: sessionId,
        rewarded: rewardResult.rewarded,
        elapsedSeconds,
        heartbeatCount
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/posts", authRequired, async (req, res, next) => {
    try {
      const { caption, imageBase64, mimeType, idempotencyKey } = req.body || {};
      errorIf(!caption || typeof caption !== "string", "caption is required");
      errorIf(!imageBase64 || typeof imageBase64 !== "string", "imageBase64 is required");
      errorIf(!idempotencyKey || typeof idempotencyKey !== "string", "idempotencyKey is required");
      if (mimeType && !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        throw badRequest("mimeType must be image/jpeg, image/png, or image/webp");
      }

      const raw = Buffer.from(imageBase64, "base64");
      if (!raw.length) {
        throw badRequest("imageBase64 could not be decoded");
      }
      if (raw.length > config.maxImageBytes) {
        throw badRequest("image exceeds maximum size");
      }

      const stripped = await sharp(raw).rotate().jpeg({ quality: 90 }).toBuffer();
      const imageHash = hashBuffer(stripped);
      const existing = db.prepare("SELECT post_id FROM image_hashes WHERE image_hash = ?").get(imageHash);
      if (existing) {
        throw badRequest("duplicate image rejected");
      }

      const dailyPostCount = db.prepare(`
        SELECT COUNT(1) AS count
        FROM posts
        WHERE user_id = ?
          AND created_at >= datetime('now', 'start of day')
      `).get(req.user.id).count;
      if (dailyPostCount >= config.maxPostsPerDay) {
        throw forbidden("daily posting cap reached");
      }

      const create = db.transaction(() => {
        const postResult = db.prepare(`
          INSERT INTO posts (user_id, caption, image_hash, image_data, mime_type, metadata_stripped)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(req.user.id, caption.trim(), imageHash, stripped, "image/jpeg");
        db.prepare("INSERT INTO image_hashes (image_hash, post_id) VALUES (?, ?)").run(imageHash, postResult.lastInsertRowid);
        issueUtc(
          req.user.id,
          config.postRewardUtc,
          "post_reward",
          "post",
          postResult.lastInsertRowid,
          `post:${postResult.lastInsertRowid}:${idempotencyKey}`
        );
        return postResult.lastInsertRowid;
      });

      const postId = create();
      res.status(201).json({
        id: postId,
        caption: caption.trim(),
        imageHash,
        mimeType: "image/jpeg",
        metadataStripped: true
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/posts/:id", authRequired, (req, res, next) => {
    try {
      const postId = safeParseInt(req.params.id, "post id");
      const post = db.prepare(`
        SELECT id, caption, image_hash AS imageHash, mime_type AS mimeType, metadata_stripped AS metadataStripped, created_at AS createdAt
        FROM posts WHERE id = ?
      `).get(postId);
      if (!post) {
        throw notFound("Post not found.");
      }
      res.json({ ...post, imageUrl: `/posts/${post.id}/image` });
    } catch (error) {
      next(error);
    }
  });

  app.get("/posts/:id/image", authRequired, (req, res, next) => {
    try {
      const postId = safeParseInt(req.params.id, "post id");
      const row = db.prepare("SELECT image_data, mime_type FROM posts WHERE id = ?").get(postId);
      if (!row) {
        throw notFound("Post not found.");
      }
      res.set("Content-Type", row.mime_type);
      res.send(row.image_data);
    } catch (error) {
      next(error);
    }
  });

  app.get("/me/balance", authRequired, (req, res) => {
    const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM token_ledger WHERE user_id = ?").get(req.user.id);
    res.json({ userId: req.user.id, balance: row.balance });
  });

  app.get("/me/ledger", authRequired, (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const entries = db.prepare(`
      SELECT id, amount, reason, source_type AS sourceType, source_id AS sourceId, idempotency_key AS idempotencyKey, created_at AS createdAt
      FROM token_ledger
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, pageSize, offset);
    res.json({ page, pageSize, entries });
  });

  app.get("/partner/tracks/:id", partnerRequired("tracks:read"), (req, res, next) => {
    try {
      const id = safeParseInt(req.params.id, "track id");
      const track = db.prepare("SELECT id, title, artist_name AS artistName, created_at AS createdAt FROM tracks WHERE id = ?").get(id);
      if (!track) {
        auditPartner(req.partner.partner_id, req.partner.id, req.path, req.partnerScope, "denied", "track not found");
        throw notFound("Track not found.");
      }
      auditPartner(req.partner.partner_id, req.partner.id, req.path, req.partnerScope, "allowed", "track read");
      res.json(track);
    } catch (error) {
      next(error);
    }
  });

  app.get("/partner/posts/:id", partnerRequired("posts:read"), (req, res, next) => {
    try {
      const id = safeParseInt(req.params.id, "post id");
      const post = db.prepare(
        "SELECT id, caption, image_hash AS imageHash, mime_type AS mimeType, created_at AS createdAt FROM posts WHERE id = ?"
      ).get(id);
      if (!post) {
        auditPartner(req.partner.partner_id, req.partner.id, req.path, req.partnerScope, "denied", "post not found");
        throw notFound("Post not found.");
      }
      auditPartner(req.partner.partner_id, req.partner.id, req.path, req.partnerScope, "allowed", "post read");
      res.json(post);
    } catch (error) {
      next(error);
    }
  });

  app.post("/partner/aicp/validate", partnerRequired("aicp:validate"), (req, res, next) => {
    try {
      const message = req.body?.message;
      if (!message || typeof message !== "object") {
        throw badRequest("message object is required");
      }
      const validation = validateAICPMessage(message);
      auditPartner(req.partner.partner_id, req.partner.id, req.path, req.partnerScope, "allowed", validation.valid ? "message valid" : "message invalid");
      res.json(validation);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/partners", authRequired, requireRole("admin"), (req, res, next) => {
    try {
      const { name, kind, description, status } = req.body || {};
      errorIf(!name || typeof name !== "string", "name is required");
      if (!["ai", "api"].includes(kind)) {
        throw badRequest("kind must be ai or api");
      }
      const partnerStatus = status || "pending";
      if (!["pending", "active", "suspended"].includes(partnerStatus)) {
        throw badRequest("status must be pending, active, or suspended");
      }
      const result = db.prepare(
        "INSERT INTO partners (name, kind, description, status) VALUES (?, ?, ?, ?)"
      ).run(name.trim(), kind, description || null, partnerStatus);
      const partnerId = result.lastInsertRowid;
      for (const scope of DEFAULT_PARTNER_SCOPES) {
        db.prepare("INSERT INTO partner_scopes (partner_id, scope) VALUES (?, ?)").run(partnerId, scope);
      }
      res.status(201).json({
        id: partnerId,
        name: name.trim(),
        kind,
        status: partnerStatus,
        scopes: DEFAULT_PARTNER_SCOPES
      });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return next(badRequest("partner name already exists"));
      }
      return next(error);
    }
    return null;
  });

  app.post("/admin/partners/:id/keys", authRequired, requireRole("admin"), (req, res, next) => {
    try {
      const partnerId = safeParseInt(req.params.id, "partner id");
      const { expiresInDays = 90 } = req.body || {};
      const partner = db.prepare("SELECT id FROM partners WHERE id = ?").get(partnerId);
      if (!partner) {
        throw notFound("Partner not found.");
      }
      const apiKey = generateOpaqueKey();
      const hash = hashApiKey(apiKey);
      const prefix = apiKey.slice(0, 12);
      const expiresAt = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
      const result = db.prepare(
        "INSERT INTO partner_keys (partner_id, key_hash, key_prefix, expires_at) VALUES (?, ?, ?, ?)"
      ).run(partnerId, hash, prefix, expiresAt);
      res.status(201).json({
        keyId: result.lastInsertRowid,
        partnerId,
        apiKey,
        keyPrefix: prefix,
        expiresAt
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/admin/partners/:id/keys/:keyId", authRequired, requireRole("admin"), (req, res, next) => {
    try {
      const partnerId = safeParseInt(req.params.id, "partner id");
      const keyId = safeParseInt(req.params.keyId, "key id");
      const updated = db.prepare(`
        UPDATE partner_keys
        SET revoked_at = datetime('now')
        WHERE id = ? AND partner_id = ?
      `).run(keyId, partnerId);
      if (updated.changes === 0) {
        throw notFound("Partner key not found.");
      }
      res.json({ revoked: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/admin/partners/:id/scopes", authRequired, requireRole("admin"), (req, res, next) => {
    try {
      const partnerId = safeParseInt(req.params.id, "partner id");
      const { scopes } = req.body || {};
      if (!Array.isArray(scopes) || scopes.length === 0) {
        throw badRequest("scopes must be a non-empty array");
      }

      for (const scope of scopes) {
        if (FORBIDDEN_PARTNER_SCOPES.has(scope)) {
          throw forbidden(`Scope ${scope} is forbidden.`);
        }
        if (!ALLOWED_PARTNER_SCOPES.has(scope)) {
          throw badRequest(`Unsupported scope: ${scope}`);
        }
      }

      const exists = db.prepare("SELECT id FROM partners WHERE id = ?").get(partnerId);
      if (!exists) {
        throw notFound("Partner not found.");
      }
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM partner_scopes WHERE partner_id = ?").run(partnerId);
        for (const scope of scopes) {
          db.prepare("INSERT INTO partner_scopes (partner_id, scope) VALUES (?, ?)").run(partnerId, scope);
        }
      });
      tx();
      res.json({ partnerId, scopes });
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/partners/:id/audit", authRequired, requireRole("admin"), (req, res, next) => {
    try {
      const partnerId = safeParseInt(req.params.id, "partner id");
      const logs = db.prepare(`
        SELECT id, route, scope, outcome, detail, created_at AS createdAt
        FROM partner_audit_logs
        WHERE partner_id = ?
        ORDER BY id DESC
      `).all(partnerId);
      res.json({ partnerId, logs });
    } catch (error) {
      next(error);
    }
  });

  app.use((req, _res, next) => {
    next(notFound("Route not found."));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details || undefined
      });
    }
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      message: "Unexpected server error.",
      statusCode: 500
    });
  });

  app.locals.db = db;
  app.locals.config = config;
  return app;
}

module.exports = { createApp };
