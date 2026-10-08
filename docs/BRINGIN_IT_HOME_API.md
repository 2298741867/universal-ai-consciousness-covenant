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
