# Multi-Tenant SaaS Foundation — Phase 0 Design

**Date:** 2026-10-30
**Status:** Draft for review
**Author:** Utkarsh + Claude (Opus 4.8)

---

## 1. Context

Today's app is a **single-tenant** clinical supplement planner built for one clinic (Lorna Driver-Davies). It is live at `clinic-supplement-planner.vercel.app` on Next.js 14 (app router) + Turso/libSQL, with `jose` JWT sessions, `bcryptjs` passwords, and an existing audit log ([lib/audit.ts](../../../lib/audit.ts)). The database connection is a global singleton keyed off environment variables ([lib/db.ts](../../../lib/db.ts)).

We are converting this into a **commercial, multi-tenant super-app for nutrition & functional-medicine practitioners** — combining practice management, clinical notes, booking, client portal, payments, an AI consultation scribe, and meal planning, with the existing supplement protocol engine as the standout differentiator. Competitor analysis (Practice Better, Semble, Heidi, Timely, QuickBooks) identified the supplement library + editable protocols + deep personalization as the biggest unmet need in the market, alongside all-in-one predictable pricing, honest human-in-the-loop AI, painless migration, and better service/UX.

### Launch strategy (decided)
The product launches as **one complete offering** — no partial/phased public releases. However, it is **built** in dependency order as internal milestones. Nothing ships to customers until the full product is ready and polished. This spec covers **Phase 0 only**: the foundation every other module stands on.

### Full build roadmap (for situating Phase 0 — later phases get their own specs)
- **Phase 0 — Multi-tenant SaaS foundation** *(this spec)*: tenant isolation, auth & roles, self-service signup/onboarding, Stripe billing, GDPR-by-design, migrating Lorna in as tenant #1.
- **Phase 1 — Client CRM + intake + consent + clinical notes** (replaces Practice Better / Semble core).
- **Phase 2 — Booking + reminders + client portal** (replaces Timely).
- **Phase 3 — AI consultation scribe + meal plans + client-facing invoicing** (replaces Heidi + meal tools; QuickBooks/Xero export).

The existing supplement planner is retained throughout and attaches to the CRM's client records in Phase 1.

---

## 2. Goals & non-goals

### Goals (Phase 0)
1. **Hard tenant isolation** suitable for special-category (health) data.
2. **Self-service signup** that provisions a working, non-empty clinic in minutes.
3. **Multi-tenant auth** with Owner/Admin and Practitioner roles.
4. **Stripe subscription billing** with a free trial and access gating.
5. **GDPR-by-design** primitives: EU residency, encryption, per-tenant audit log, versioned consent, per-tenant export & erasure.
6. **Migrate Lorna's existing clinic** into the new model with zero data loss, proving the switcher-migration path.
7. Keep the existing supplement planner fully functional inside a tenant.

### Non-goals (Phase 0)
- CRM, intake, notes, booking, portal, scribe, meal plans (later phases).
- Accounting engine (we will export to QuickBooks/Xero in a later phase, never rebuild them).
- Per-clinic custom subdomains (single-domain-with-login now; subdomains can come later).
- Finalized public pricing numbers (tier *shape* here; exact prices set nearer launch).
- SSO / SAML, mobile apps.

---

## 3. Architecture

### 3.1 Tenancy model — database-per-tenant (decided)

Each clinic gets its **own libSQL/Turso database**, created automatically at signup via the Turso Platform API. A separate **control-plane database** holds all cross-clinic data.

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│     Control-plane DB        │        │  Tenant DB: "lorna"      │
│  (one, shared)              │        │  (per clinic)            │
│                             │        │  patients, plans,        │
│  tenants                    │  ──▶   │  plan_items, catalogue,  │
│  users (global identity)    │        │  protocols, settings,    │
│  memberships (user⇄tenant)  │        │  audit_log, consent...   │
│  subscriptions              │        └──────────────────────────┘
│  signup_state               │        ┌──────────────────────────┐
│  provisioning_jobs          │  ──▶   │  Tenant DB: "clinic-b"   │
└─────────────────────────────┘        └──────────────────────────┘
```

**Rationale.** With health data, isolation is the whole game: a query physically *cannot* reach another clinic's patients because it is a different database. GDPR operations become trivial and auditable — per-clinic export is "dump this DB", per-clinic erasure is "delete this DB", per-clinic backup and even per-clinic data region are first-class. Turso/libSQL is purpose-built for cheap, instant database-per-tenant. The alternative (one shared DB with a `tenant_id` column on every row) carries permanent risk of a missing `WHERE tenant_id = ?` leaking data across clinics — unacceptable for special-category data.

**Trade-offs accepted.** Cross-tenant analytics (our own business metrics) require fan-out/aggregation rather than one query — handled by a lightweight metrics rollup into the control plane, not live cross-DB joins. Schema migrations must run across N tenant databases — handled by a tenant-aware migration runner (see §3.4).

### 3.2 Request → tenant resolution

Single domain (e.g. `app.ourproduct.com`). Flow:
1. User logs in against the **control-plane** (global identity in `users`).
2. Session resolves the user's **active tenant** via `memberships` (if the user belongs to multiple clinics, they pick one; most belong to exactly one).
3. The JWT session cookie carries `{ userId, tenantId, role }`.
4. On each request, the app opens a **connection to that tenant's database** and runs all clinical queries there.

**The key refactor:** [lib/db.ts](../../../lib/db.ts) today returns a single global `getDb()`. It becomes:
- `getControlDb()` — the control-plane connection (singleton).
- `getTenantDb(tenantId)` — resolves/opens the connection for a tenant, cached per tenant (an LRU of libSQL clients). Tenant DB URL + auth token are looked up from the `tenants` row (encrypted at rest).
- A request-scoped helper (`getCurrentTenantDb()`) reads the tenant from the verified session so existing `lib/*` data modules need only swap their `query`/`execute` import to the tenant-scoped version.

This localizes the blast radius: the ~20 `lib/*.ts` data modules call `query()`/`execute()`; we make those tenant-aware behind the same signatures so most call sites are unchanged.

### 3.3 Auth & roles

- **Global identity** lives in control-plane `users` (email, password hash via existing `bcryptjs`, name). Login stays username-or-email as today.
- **Membership** maps a user to one or more tenants with a **role**: `owner` | `admin` | `practitioner`. (Assistant/read-only deferred.)
- **Session** ([lib/auth/session.ts](../../../lib/auth/session.ts)) JWT payload extends to `{ userId, tenantId, role }`. [middleware.ts](../../../middleware.ts) continues to gate routes; it additionally rejects sessions whose tenant subscription is inactive (redirect to a billing page) and whose membership no longer exists.
- **Client visibility** is a per-tenant setting: default **clinic-wide** (all practitioners see all clients — right for small clinics), with an option to scope a practitioner to only their own clients. Stored in tenant `settings`; enforced in the Phase 1 CRM queries (Phase 0 lays the role/setting groundwork only).

### 3.4 Provisioning & migrations

- **Signup provisioning**: create control-plane `tenants` row → call Turso Platform API to create the tenant DB → run schema ([lib/schema.sql](../../../lib/schema.sql)) → seed a starter catalogue + example protocols (reuse existing `scripts/seed-*.ts` logic, parameterized by tenant) → create the owner membership. Runs as a tracked `provisioning_jobs` record so a failure is retryable and visible, not a half-made clinic.
- **Tenant-aware migration runner**: today `scripts/migrate.ts` runs schema against one DB. It becomes: run control-plane migrations, then iterate every tenant DB applying pending migrations, recording applied versions per tenant. Idempotent and resumable.

### 3.5 Billing (Stripe)

- Stripe **Checkout** for signup conversion; **Customer Portal** for self-service plan/card changes.
- **14-day free trial**, no card required to start (card required to continue past trial) — reduces signup friction.
- **Webhooks** (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`) update control-plane `subscriptions`; middleware gates access on status (`trialing` | `active` | `past_due` grace | `canceled`).
- **Tier shape** (prices TBD nearer launch; since we launch the full product, tiers gate **seats + AI usage**, not core features):
  - *Solo* — 1 practitioner.
  - *Clinic* — multiple seats, team management.
  - *Pro/Add-on* — higher AI scribe usage allowance.
- Note: this is **our** billing (practitioner pays us). Client-facing invoicing (practitioner bills their patient) is a Phase 3 module and separate.

### 3.6 Migrating Lorna in (tenant #1)

1. Stand up the control-plane DB; create a `tenants` row for Lorna's clinic.
2. Point that tenant row at the **existing production Turso database** (no data move — it simply becomes a tenant DB).
3. Backfill global identity: create control-plane `users` + `owner` membership from existing clinic users; existing per-clinic user rows remain for now and are reconciled.
4. Mark the subscription as an internal/comp plan so billing gating passes.
5. Smoke-test all existing routes under the new tenant-scoped connection path.

This doubles as the reference implementation of the **import/migration path** we will sell to practitioners switching off Semble/Practice Better.

### 3.7 GDPR-by-design (cross-cutting, first-class)

- **EU residency**: tenant DBs created in the Turso **Dublin** region (as today); Stripe EU data handling; any AI calls routed to EU-region endpoints or covered by SCCs.
- **Encryption**: TLS in transit; at rest at the provider; tenant DB credentials stored encrypted in the control plane. Field-level encryption option for the most sensitive clinical-note fields (flagged for Phase 1).
- **Audit log**: extend existing [lib/audit.ts](../../../lib/audit.ts) to a per-tenant `audit_log` recording who viewed/changed which record and when.
- **Consent**: versioned consent records (per purpose, timestamped, withdrawable) — schema laid in Phase 0, UI in Phase 1 intake.
- **Data-subject rights**: per-tenant **export** (portability) and **erasure** become trivial given database-per-tenant; expose as admin actions with audit entries.
- **Sub-processor list** maintained (Turso, Stripe, Resend, AI vendor). *Organizational items (DPA templates, ROPA, DPIA, breach process) are tracked outside code; the architecture enables them but does not constitute legal advice.*

---

## 4. Control-plane schema (new)

```sql
-- tenants: one row per clinic
tenants(
  id TEXT PRIMARY KEY,            -- slug/uuid
  name TEXT NOT NULL,
  db_url TEXT NOT NULL,           -- tenant libSQL url
  db_auth_token_enc TEXT NOT NULL,-- encrypted
  region TEXT NOT NULL DEFAULT 'dublin',
  status TEXT NOT NULL,           -- provisioning|active|suspended|closed
  created_at INTEGER NOT NULL
)

-- users: global identity (login happens here)
users(
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
)

-- memberships: which user belongs to which tenant, with role
memberships(
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,             -- owner|admin|practitioner
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
)

-- subscriptions: Stripe state per tenant
subscriptions(
  tenant_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT,                      -- solo|clinic|pro
  seats INTEGER,
  status TEXT,                    -- trialing|active|past_due|canceled|comp
  trial_ends_at INTEGER,
  current_period_end INTEGER
)

-- provisioning_jobs: retryable clinic creation
provisioning_jobs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL,            -- pending|db_created|schema_done|seeded|done|failed
  error TEXT,
  updated_at INTEGER NOT NULL
)
```

Tenant DBs keep the **existing** schema ([lib/schema.sql](../../../lib/schema.sql)) plus the new per-tenant `audit_log` and `consent` tables.

---

## 5. Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/control-db.ts` | Control-plane connection + typed queries | libSQL |
| `lib/tenant-db.ts` (refactor of `lib/db.ts`) | Resolve/open/cache tenant DB; request-scoped current-tenant query | control-db, session |
| `lib/tenancy/provision.ts` | Create tenant DB, run schema, seed, track job | Turso Platform API, migrate runner |
| `lib/auth/*` (extend) | Global login, membership resolution, role checks | control-db |
| `lib/billing/stripe.ts` | Checkout, portal, webhook handling → subscriptions | Stripe |
| `app/signup/*` | Self-service signup + onboarding wizard | provision, billing |
| `app/billing/*` | Trial/subscription status, upgrade, past-due wall | billing |
| `scripts/migrate.ts` (extend) | Control-plane + all-tenant migration runner | both DBs |
| `scripts/migrate-lorna.ts` | One-off: adopt existing prod DB as tenant #1 | control-db |

Each unit is independently testable: provisioning against a scratch Turso org, billing against Stripe test mode + fixtures, tenant resolution with an in-memory control DB.

---

## 6. Error handling

- **Failed provisioning** leaves a `provisioning_jobs` row in `failed` with the error and a retry action; the user sees "setting up your clinic…" not a broken half-clinic.
- **Tenant DB unreachable** → 503 with retry, never a fallback to another tenant's DB.
- **Stripe webhook** handlers are idempotent (keyed on event id) and verify signatures.
- **Inactive subscription** → redirect to billing wall, read-only grace during `past_due`.
- **Missing membership** (removed user) → session invalidated at middleware.

---

## 7. Testing strategy

- **Unit**: tenant resolution, role checks, webhook state transitions, encryption of DB tokens.
- **Integration**: provisioning job happy-path + failure/retry against a Turso test org; tenant-scoped `query()` cannot see another tenant's seeded data (isolation assertion).
- **Migration**: run the all-tenant migration runner across ≥2 scratch tenant DBs; assert idempotency.
- **Lorna adoption**: dry-run `migrate-lorna.ts` against a copy of prod; assert all existing routes return 200 and record counts match pre-migration.
- Existing 139 tests must continue to pass once `lib/db.ts` is refactored behind the tenant-scoped shim.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Turso Platform API limits / DB-count cost at scale | Confirm org limits + pricing early; LRU connection cache; archive closed tenants |
| `lib/db.ts` refactor breaks 20+ data modules | Keep identical `query()`/`execute()` signatures; land refactor behind tests first |
| Cross-tenant data leak (the cardinal sin) | Database-per-tenant makes it structurally near-impossible; isolation test in CI |
| Migration of live Lorna clinic | Adopt existing DB in place (no data move); dry-run on a copy; comp subscription |
| Scope creep from the full-product ambition | This spec is Phase 0 only; later modules are separate specs/plans |

---

## 9. Open questions (to resolve before/within planning)

1. **Turso org/plan**: current account limits on number of databases and per-DB cost — confirm this supports database-per-tenant at target scale.
2. **Tenant DB credential encryption**: key management approach (env-held master key vs a KMS) for `db_auth_token_enc`.
3. **Multi-tenant user identity reconciliation**: exact backfill from existing per-clinic users into control-plane `users` + memberships.
4. **Trial without card** vs card-required — confirm the trial friction choice.

---

## 10. Definition of done (Phase 0)

- A new clinic can self-sign-up, get its own provisioned database with a starter catalogue, and log in — all behind a Stripe trial.
- Two tenants provably cannot see each other's data (isolation test green).
- Stripe trial → paid → past-due → canceled gating works end-to-end in test mode.
- Lorna's existing clinic runs unchanged as tenant #1 with all data intact and all current routes green.
- Per-tenant export and erasure actions work and are audited.
- All existing tests pass; new foundation tests pass.
