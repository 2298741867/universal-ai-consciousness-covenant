# Bringin' It Home API Slice

This repository now includes a Node.js application slice at:

- `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/app/bringin-it-home/`

It is intentionally isolated from existing covenant runtime code (FL/AICP/mesh) and reuses the canonical AICP validator for partner AI payload validation.

## Run

```bash
npm install
npm run app:db:init
npm run app:start
```

## Test

```bash
npm run test:app
```

## Environment

- `PORT` (default `3000`)
- `JWT_SECRET` (required in production)
- `BRINGIN_HOME_DB_PATH` (default `app/bringin-it-home/data/bringin-it-home.db`)
- `BRINGIN_HOME_DATA_DIR` (default `app/bringin-it-home/data`)
- `LISTENER_REWARD_UTC` (default `10`)
- `ARTIST_REWARD_UTC` (default `3`)
- `POST_REWARD_UTC` (default `5`)
- `MAX_POSTS_PER_DAY` (default `5`)
- `MAX_IMAGE_BYTES` (default `5242880`)
- `STRIPE_SECRET_KEY` (optional; only `sk_test_` keys are accepted)
- `STRIPE_WEBHOOK_SECRET` (required for funded-rewards webhooks)
- `REWARDS_PUBLIC_URL` (default `http://localhost:3000`; HTTPS required except on localhost)

## Funded Rewards

Stripe Connect **test-mode** funding, independent contribution review, proportional
cash allocations, account onboarding, transfers, and reconciliation are documented
in [FUNDED_REWARDS.md](FUNDED_REWARDS.md). These are separate from UTC credits;
test funds have no cash value. No automatic YouTube/Spotify listening payouts or
live money movement are enabled.

Public registration can only create ordinary users. To grant an administrator role,
register the user, then run this command on the server with the same database
configuration as the API:

```bash
npm run app:admin:grant -- registered-user@example.com
```

**Upgrade precaution:** older versions allowed public admin registration. Audit
existing `users.role` assignments and remove untrusted administrators before
configuring Stripe. Changing this registration endpoint does not revoke existing roles.

## API Surfaces

### Public
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`

### User JWT Required
- `POST /tracks`
- `GET /tracks/:id`
- `POST /tracks/:id/listen/start`
- `POST /tracks/:id/listen/heartbeat`
- `POST /tracks/:id/listen/end`
- `POST /posts`
- `GET /posts/:id`
- `GET /posts/:id/image`
- `GET /me/balance`
- `GET /me/ledger`

### Partner Key Required
- `GET /partner/tracks/:id` (`tracks:read`)
- `GET /partner/posts/:id` (`posts:read`)
- `POST /partner/aicp/validate` (`aicp:validate`)

### Admin JWT Required
- `POST /admin/partners`
- `POST /admin/partners/:id/keys`
- `DELETE /admin/partners/:id/keys/:keyId`
- `PATCH /admin/partners/:id/scopes`
- `GET /admin/partners/:id/audit`

## Security / Governance Rules Implemented

- UTC is append-only in `token_ledger`; balance is always `SUM(amount)`.
- Partner keys are hashed at rest, expirable, revocable, and scope-gated.
- Forbidden partner scopes are blocked (`tokens:mint`, `tokens:burn`, `admin:write`, `balances:read`, `pii:read`).
- Partner activity is append-only audited per request.
- Listening rewards require:
  - session start/end lifecycle
  - >= 3 heartbeats
  - >= 30 seconds
  - one reward per user+track per 24h
  - self-listen block
- Photo rewards enforce:
  - image metadata stripping by re-encoding
  - duplicate hash rejection
  - daily post cap
