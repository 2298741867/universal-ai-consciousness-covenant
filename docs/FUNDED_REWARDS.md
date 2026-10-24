# Funded contribution rewards: Stripe Connect test mode

This backend milestone adds sponsor-funded rewards for independently reviewed
knowledge, code, translation, and community contributions. It does **not** enable
live payments, promise income, convert UTC credits to money, or pay for YouTube or
Spotify streams. Stripe test funds have no cash value. There is no rewards web UI
yet; the endpoints below are intended for the next accessible app interface.

## Setup

Use a Stripe platform sandbox/test account with Connect enabled. This initial
integration supports US Express connected accounts and USD card funding only.
Never put secret keys in the browser, source control, or contribution evidence.

```bash
npm install
export JWT_SECRET='replace-with-a-long-random-secret'
export STRIPE_SECRET_KEY='sk_test_replace'
export STRIPE_WEBHOOK_SECRET='whsec_replace'
export REWARDS_PUBLIC_URL='http://localhost:3000'
npm run app:start
```

Use your Stripe CLI's local listener to forward events to
`http://localhost:3000/rewards/stripe/webhook`, for example:

```bash
stripe listen \
  --events payment_intent.succeeded,charge.refunded,charge.dispute.created,transfer.reversed \
  --forward-to localhost:3000/rewards/stripe/webhook
```

Copy the listener's signing secret into `STRIPE_WEBHOOK_SECRET` and restart the API.
For a deployed sandbox, configure a signed **platform-account** webhook destination
with these same events. Connected-account bank payout events are not used as proof
that a contributor has received money.

Register an operator account through `POST /auth/register`, then grant its role
through server access, not through public HTTP:

```bash
npm run app:admin:grant -- registered-user@example.com
```

Use the same `BRINGIN_HOME_DB_PATH` for the command and API. Log in through
`POST /auth/login` and send the returned token as `Authorization: Bearer <token>`.
Before enabling the integration on an existing database, audit all existing admin
roles: earlier versions allowed public admin registration.

## Workflow

1. **Fund:** an administrator calls `POST /rewards/admin/funding` with
   `{"amountCents":1000}` and a unique `Idempotency-Key` header. The amount must be
   an integer from 100 to 1,000,000 USD cents. Reuse the same key when retrying the
   same request; a changed amount is rejected. The response includes the local
   funding ID, PaymentIntent ID, and client secret. Treat the client secret as
   sensitive; only give it to the funding user's payment interface.
2. **Confirm the test payment:** use Stripe's test payment interface/SDK with the
   returned client secret, or confirm the PaymentIntent using the Stripe CLI and
   the `pm_card_visa` test payment method. The API does not collect card data.
   Merely creating an intent or visiting a return URL does not fund the pool.
   A valid `payment_intent.succeeded` webhook retrieves the PaymentIntent and its
   charge/balance transaction and confirms the matching amount, USD currency, and
   test mode. Only the net amount after Stripe processing fees is allocatable.
   If the balance transaction is not yet available, webhook processing fails
   explicitly and must be retried by Stripe.
3. **Onboard:** each contributor calls `POST /rewards/connect/onboard` with their
   user token and opens the returned Stripe-hosted URL. The API creates and owns
   the user-to-account mapping; clients cannot nominate another account.
   Complete Stripe's test onboarding. The return page does not assert eligibility.
   `GET /rewards/me` retrieves fresh account requirements/eligibility from Stripe.
4. **Submit evidence:** contributors call `POST /rewards/contributions`, for example:

   ```json
   {
     "kind": "knowledge",
     "title": "Accessible introduction to federated learning",
     "description": "Original guide with references, examples, and a transcript.",
     "evidenceUrl": "https://example.org/my-original-guide"
   }
   ```

   Kinds are `knowledge`, `code`, `translation`, and `community`. HTTPS evidence
   URLs are required; identical normalized URLs (ignoring fragments) cannot be
   submitted twice. The server does not fetch arbitrary evidence URLs. URL
   deduplication is a basic safeguard, not proof of originality or Sybil resistance.
5. **Verify:** an administrator lists pending contributions and calls
   `POST /rewards/admin/contributions/:id/review` with
   `{"decision":"approved","points":10,"reason":"Verified sources, originality, and usefulness."}`.
   Rejection uses `decision: "rejected"` and a reason. Approval points must be
   integers from 1 to 1000. A contributor cannot review their own work. Reviews
   are final in this milestone; there is no automatic AI approval.
6. **Allocate:** call `POST /rewards/admin/funding/:id/allocate` with
   `{"contributionIds":["approved-id-1","approved-id-2"]}`. An administrator selects
   1-100 distinct approved contributions, and the complete net pool is split
   proportionally by verified points. Largest-remainder allocation conserves
   every cent with contribution IDs breaking ties. For example, 971 net cents
   split across 1 and 2 points produces 324 and 647 cents. Each contribution can
   receive only one allocation. Each pool is allocated only once. The operation
   reserves funds atomically and fails if any share would be less than one cent.
   There is no claim of ecosystem-wide fairness: the administrator's selection
   and points remain governance decisions recorded in the audit.
7. **Transfer:** an administrator calls `POST /rewards/admin/rewards/:id/transfer`.
   The server checks current account eligibility, the pool's risk state, and the
   source charge's refund/dispute state. It persists a processing reservation,
   destination, and retry timestamp **before** calling Stripe. A stable
   idempotency key and `source_transaction` tie the transfer to the reserved
   reward and funded charge. Stripe can defer availability until the charge
   settles. `transferred` means sent to a connected **Stripe test balance**, not
   paid into a bank account. Stripe controls subsequent payout timing and fees.

## Endpoints

All `/rewards/admin/*` routes require an administrator bearer token. Partner AI/API
keys grant no access to reviews, allocations, funding, or transfers.

| Route | Access | Purpose |
|-------|--------|---------|
| `GET /rewards/policy` | Public | Scope, exclusions, and test-mode disclosure |
| `POST /rewards/stripe/webhook` | Stripe signature | Raw-body signed funding/risk events |
| `GET /rewards/connect/return` | Public | Informational onboarding return |
| `GET /rewards/connect/refresh` | Public | Instructions for obtaining a fresh link |
| `POST /rewards/connect/onboard` | User | Create/refresh own onboarding link |
| `POST /rewards/contributions` | User | Submit evidence for review |
| `GET /rewards/me` | User | Own contributions, rewards, totals, account eligibility |
| `GET /rewards/admin/contributions?status=pending` | Admin | Review queue (`pending`, `approved`, `rejected`) |
| `POST /rewards/admin/contributions/:id/review` | Admin | Independent final approval/rejection |
| `POST /rewards/admin/funding` | Admin | Idempotent USD test funding intent |
| `GET /rewards/admin/funding` | Admin | Funding state |
| `POST /rewards/admin/funding/:id/allocate` | Admin | Reserve proportional rewards |
| `GET /rewards/admin/rewards` | Admin | Transfer state |
| `POST /rewards/admin/rewards/:id/transfer` | Admin | Transfer or safely retry a reserved reward |
| `POST /rewards/admin/rewards/:id/reconcile` | Admin | Recover a transfer whose response was lost |
| `GET /rewards/admin/audit` | Admin | Latest append-only audit entries |

List endpoints return at most 100 records; `/rewards/me` totals cover all rewards,
including older ones. A larger public rollout needs pagination and operational
reporting before these views can serve as complete accounting exports.

## Failure handling and financial boundaries

- Raw webhook bytes are signature-verified before JSON processing. Live events and
  live secret keys are rejected. Duplicate event IDs are ignored transactionally.
- Refunds (including partial refunds), disputes, and transfer reversals block the
  associated pool. Risk events arriving before funding confirmation still block
  it. Existing transfers are **not** automatically clawed back. Reversal state
  does not release a reward for another payment. Investigate recovery in Stripe;
  the platform remains responsible for fees, refunds, disputes, and losses.
- A transfer timeout or error leaves its money reserved as `processing`, even if
  Stripe may not have accepted it. Retrying within 23 hours uses the same
  idempotency key. After that, creation is refused to avoid reusing a key after
  Stripe's retention window. Use the reconciliation endpoint: it finds the unique
  matching Stripe transfer and validates amount, currency, destination, source
  charge, and group before recording it.
- If reconciliation finds zero or multiple transfers, funds remain reserved and
  the API returns an explicit conflict. Do not reset status or issue a new reward
  to bypass it. Investigate through Stripe and operator-controlled accounting.
  Similarly, funding creation with a lost response and no persisted PaymentIntent
  is not retried after 23 hours; inspect its `cash_funding_id` metadata in Stripe
  and reconcile the database under operator control.
- Audit entries cannot be updated or deleted through ordinary SQL statements.
  This is not a tamper-proof external accounting system: privileged database
  operators can still change schema/data. Use restricted database access, durable
  storage, backups, and external reconciliation.
- SQLite requires one authoritative persistent database for these reservations.
  Do not run independently funded instances against separate ephemeral databases.
- No real Stripe service is needed for automated tests: they use a deterministic
  fake provider plus the real Stripe SDK's webhook signing/verification. Run
  `npm run test:rewards`. Before treating the integration as ready for users,
  exercise real sandbox onboarding, successful/failed funding, event retries,
  fees, connected balance transfers, and reversals in your own Stripe account.
- Live launch is deliberately disabled. It requires provider approval of the
  business model, a funded loss reserve, identity/compliance and tax processes,
  contribution/fraud governance, recovery procedures, accessible UI, and a separate
  review of any third-party music integration. Listening-session UTC credits are
  not verified YouTube/Spotify play counts and cannot be redeemed through this API.
