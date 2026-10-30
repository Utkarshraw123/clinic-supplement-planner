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

-- Which user belongs to which tenant, and their role there.
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','practitioner')),
  tenant_user_id INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tenant_id)
);
