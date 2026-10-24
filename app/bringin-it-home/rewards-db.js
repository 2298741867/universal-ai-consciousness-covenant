"use strict";

function initializeRewardsDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_installation (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      namespace TEXT NOT NULL UNIQUE
    );
    INSERT OR IGNORE INTO cash_installation (id, namespace) VALUES (1, lower(hex(randomblob(16))));
    CREATE TABLE IF NOT EXISTS cash_funding (
      id TEXT PRIMARY KEY,
      request_key TEXT NOT NULL UNIQUE,
      sponsor_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 100 AND 1000000),
      currency TEXT NOT NULL DEFAULT 'usd' CHECK(currency = 'usd'),
      payment_intent TEXT UNIQUE,
      charge_id TEXT UNIQUE,
      net_cents INTEGER NOT NULL DEFAULT 0 CHECK(net_cents >= 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','blocked')),
      allocated INTEGER NOT NULL DEFAULT 0 CHECK(allocated IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cash_contributions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('knowledge','code','translation','community')),
      title TEXT NOT NULL,
      evidence_url TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      points INTEGER NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 1000),
      reviewer_id INTEGER REFERENCES users(id),
      review_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cash_accounts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      stripe_account TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS cash_rewards (
      id TEXT PRIMARY KEY,
      funding_id TEXT NOT NULL REFERENCES cash_funding(id),
      contribution_id TEXT NOT NULL UNIQUE REFERENCES cash_contributions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','processing','transferred','reversed')),
      destination TEXT,
      transfer_id TEXT UNIQUE,
      processing_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cash_webhook_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cash_risk_charges (
      charge_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cash_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS cash_audit_no_update BEFORE UPDATE ON cash_audit
      BEGIN SELECT RAISE(ABORT, 'cash_audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS cash_audit_no_delete BEFORE DELETE ON cash_audit
      BEGIN SELECT RAISE(ABORT, 'cash_audit is append-only'); END;
  `);
}

module.exports = { initializeRewardsDatabase };
