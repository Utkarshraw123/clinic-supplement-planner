-- Control-plane schema. One shared database across all clinics. Holds the tenant
-- registry (which clinic lives in which libSQL database), the global login
-- identity, and the membership that maps a user to a tenant with a role.
-- Clinical/patient data never lives here — it lives in each tenant's own database.

-- One row per clinic. Points at that clinic's own libSQL database.
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,                 -- slug, e.g. "lorna-dev"
  name TEXT NOT NULL,
  db_url TEXT NOT NULL,                -- that clinic's libSQL url
  db_auth_token TEXT,                  -- null for local file DBs
  region TEXT NOT NULL DEFAULT 'dublin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('provisioning','active','suspended','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Global login identity. Login authenticates against this table, not a tenant DB.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Retryable record of a clinic being provisioned, so a partial failure is
-- visible and resumable rather than leaving a half-made clinic.
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','db_created','schema_done','seeded','done','failed')),
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which user belongs to which tenant, and their role there.
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','practitioner')),
  tenant_user_id INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tenant_id)
);

-- One subscription per tenant (control-plane). Drives access gating.
CREATE TABLE IF NOT EXISTS subscriptions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT,
  seats INTEGER,
  status TEXT NOT NULL,
  trial_ends_at TEXT,
  current_period_end TEXT
);
