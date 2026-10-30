# Phase 0b — Clinic Provisioning + Tenant Migration Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make multi-tenancy self-service: migrations run across every tenant database, each login is bridged to its tenant-local user record, and signing up a new clinic provisions its own database (schema + starter data + owner) via the Turso Platform API, tracked as a retryable job.

**Architecture:** A tenant-aware migration runner iterates the control-plane tenant registry and applies the existing idempotent `runMigrations()` to each tenant DB (via Phase 0a's `runWithDb`). An **identity bridge** stores, per membership, the tenant-local `users.id` so `session.userId` is the id every tenant table already expects. Provisioning creates a new libSQL database through the Turso Platform API, runs the schema, seeds generic starter data, and creates the owner in both the control-plane (login) and the tenant `users` table (clinic record), all under a `provisioning_jobs` row so partial failures are visible and retryable.

**Tech Stack:** Next.js 14, `@libsql/client`, Turso Platform API (REST), `vitest`, `tsx`.

## Global Constraints

- Tasks are tagged **[no token]** (buildable now) or **[needs Turso token]** (a free Turso Platform API token — no plan upgrade). Build the [no token] tasks first.
- `query`/`execute` stay tenant-aware (Phase 0a). Control-plane access uses `getControlDb`.
- Reuse the existing idempotent `runMigrations()` ([scripts/migrate.ts](../../../scripts/migrate.ts)); do not invent a second schema path.
- New clinics seed **generic** starter data only (dosing presets, note snippets) — never Lorna's Wild Nutrition/Cytoplan brands.
- Turso secrets come from env: `TURSO_PLATFORM_TOKEN`, `TURSO_ORG` (slug), `TURSO_GROUP` (default group). Never hard-code them; never log them.
- Run the suite with `npm test`; keep it green (currently 158 tests).

---

### Task 1 [no token]: Tenant-aware migration runner

**Files:**
- Modify: `lib/control-users.ts` (add `listTenants`)
- Create: `scripts/migrate-tenants.ts`
- Modify: `package.json` (add `migrate:all`)
- Test: `test/migrate-tenants.test.ts`

**Interfaces:**
- Produces: `listTenants(): Promise<{ id: string; db_url: string; db_auth_token: string | null }[]>` in `lib/control-users.ts`.
- Produces: `runAllTenantMigrations(): Promise<{ control: true; tenants: string[] }>` in `scripts/migrate-tenants.ts` — runs control migrations, then the clinical schema against every tenant DB.
- Consumes: `runControlMigrations` ([scripts/migrate-control.ts](../../../scripts/migrate-control.ts)), `runMigrations` ([scripts/migrate.ts](../../../scripts/migrate.ts)), `getTenantDb`/`runWithDb` ([lib/db.ts](../../../lib/db.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/migrate-tenants.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { runAllTenantMigrations } from "@/scripts/migrate-tenants";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("tenant-aware migration runner", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-tenant-a.db"), { force: true });
    rmSync(join(process.cwd(), "test-tenant-b.db"), { force: true });
    await resetControl();
  });

  it("applies the clinical schema to every registered tenant database", async () => {
    await upsertTenant({ id: "ta", name: "A", dbUrl: "file:test-tenant-a.db" });
    await upsertTenant({ id: "tb", name: "B", dbUrl: "file:test-tenant-b.db" });

    const result = await runAllTenantMigrations();
    expect(result.tenants.sort()).toEqual(["ta", "tb"]);

    for (const f of ["test-tenant-a.db", "test-tenant-b.db"]) {
      const db = createClient({ url: `file:${f}` });
      const t = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'");
      expect(t.rows).toHaveLength(1);
      const c = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patient_consents'");
      expect(c.rows).toHaveLength(1); // proves the FULL current schema ran, not a stale subset
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/migrate-tenants.test.ts`
Expected: FAIL — `@/scripts/migrate-tenants` not found.

- [ ] **Step 3: Add `listTenants` to `lib/control-users.ts`**

```ts
export async function listTenants(): Promise<{ id: string; db_url: string; db_auth_token: string | null }[]> {
  const rs = await getControlDb().execute("SELECT id, db_url, db_auth_token FROM tenants ORDER BY id");
  return rs.rows.map((r) => ({
    id: String(r.id),
    db_url: String(r.db_url),
    db_auth_token: r.db_auth_token ? String(r.db_auth_token) : null,
  }));
}
```

- [ ] **Step 4: Create `scripts/migrate-tenants.ts`**

```ts
import { runControlMigrations } from "./migrate-control";
import { runMigrations } from "./migrate";
import { getTenantDb, runWithDb } from "../lib/db";
import { listTenants } from "../lib/control-users";

// Apply control-plane migrations, then the clinical schema to EVERY tenant DB.
// Idempotent: runMigrations uses CREATE TABLE IF NOT EXISTS + guarded ALTERs.
export async function runAllTenantMigrations(): Promise<{ control: true; tenants: string[] }> {
  await runControlMigrations();
  const tenants = await listTenants();
  const done: string[] = [];
  for (const t of tenants) {
    const client = await getTenantDb(t.id);
    await runWithDb(client, () => runMigrations());
    done.push(t.id);
  }
  return { control: true, tenants: done };
}

if (process.argv[1] && process.argv[1].endsWith("migrate-tenants.ts")) {
  runAllTenantMigrations()
    .then((r) => { console.log(`migrated control + ${r.tenants.length} tenant(s): ${r.tenants.join(", ")}`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

Add to `package.json` scripts:

```json
"migrate:all": "tsx scripts/migrate-tenants.ts"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/migrate-tenants.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite + commit**

```bash
npm test
git add lib/control-users.ts scripts/migrate-tenants.ts package.json test/migrate-tenants.test.ts
git commit -m "feat: tenant-aware migration runner (control + every tenant DB)"
```

---

### Task 2 [no token]: Identity bridge — session.userId is the tenant-local user id

**Files:**
- Modify: `lib/control-schema.sql` (add `memberships.tenant_user_id`)
- Modify: `scripts/migrate-control.ts` (guarded column add for existing control DBs)
- Modify: `lib/control-users.ts` (`addMembership` accepts `tenantUserId`; `findPrimaryMembership` returns it)
- Modify: `lib/auth/login.ts` (`resolveLogin` returns `userId = tenant_user_id`)
- Modify: `scripts/bootstrap-dev-tenant.ts` (link the control owner to the existing tenant `users` row, creating it if absent)
- Test: `test/identity-bridge.test.ts`

**Interfaces:**
- Produces: `memberships.tenant_user_id INTEGER` — the id in the tenant's own `users` table.
- Changes: `addMembership(input: { userId; tenantId; role; tenantUserId: number })`.
- Changes: `findPrimaryMembership(userId)` returns `{ tenant_id; role; tenant_user_id }`.
- Changes: `resolveLogin` returns `SessionPayload` with `userId = tenant_user_id`.
- Consumes: Phase 0a identity + `runWithDb`/`getTenantDb`, `createUser`/`findUserByEmail` ([lib/users.ts](../../../lib/users.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/identity-bridge.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership } from "@/lib/control-users";
import { resolveLogin } from "@/lib/auth/login";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("identity bridge", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-tenant-id.db"), { force: true });
    await resetControl();
  });

  it("resolveLogin returns the tenant-local user id, not the control id", async () => {
    await upsertTenant({ id: "tid", name: "T", dbUrl: "file:test-tenant-id.db" });
    // Create a tenant-local user first so its id differs from the control id.
    const tenantClient = await getTenantDb("tid");
    const localId = await runWithDb(tenantClient, async () => {
      await runMigrations();
      await createUser({ email: "filler@x.com", password: "x", role: "team", name: "Filler" }); // id 1
      return createUser({ email: "owner@x.com", password: "x", role: "admin", name: "Owner" }); // id 2
    });
    const controlId = await createControlUser({ email: "owner@x.com", password: "pw", name: "Owner" }); // id 1 in control
    await addMembership({ userId: controlId, tenantId: "tid", role: "owner", tenantUserId: localId });

    const session = await resolveLogin("owner@x.com", "pw");
    expect(session?.userId).toBe(localId);      // tenant-local (2), the id tenant tables expect
    expect(localId).not.toBe(controlId);        // guard: the ids genuinely differ
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/identity-bridge.test.ts`
Expected: FAIL — `addMembership` has no `tenantUserId`; `resolveLogin` returns the control id.

- [ ] **Step 3: Add the column (schema + guarded migration)**

In `lib/control-schema.sql`, change the `memberships` table to include the column:

```sql
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','practitioner')),
  tenant_user_id INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tenant_id)
);
```

In `scripts/migrate-control.ts`, after running the schema statements, add a guarded column add for control DBs created before this change:

```ts
  const cols = await db.execute("PRAGMA table_info(memberships)");
  if (!cols.rows.some((c) => String((c as any).name) === "tenant_user_id")) {
    await db.execute("ALTER TABLE memberships ADD COLUMN tenant_user_id INTEGER NOT NULL DEFAULT 0");
  }
```

- [ ] **Step 4: Update `addMembership` and `findPrimaryMembership`**

In `lib/control-users.ts`:

```ts
export async function addMembership(input: { userId: number; tenantId: string; role: MembershipRole; tenantUserId: number }): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO memberships (user_id, tenant_id, role, tenant_user_id) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, tenant_id) DO UPDATE SET role=excluded.role, tenant_user_id=excluded.tenant_user_id`,
    args: [input.userId, input.tenantId, input.role, input.tenantUserId],
  });
}

export async function findPrimaryMembership(userId: number) {
  const rs = await getControlDb().execute({
    sql: "SELECT tenant_id, role, tenant_user_id FROM memberships WHERE user_id = ? ORDER BY created_at, tenant_id LIMIT 1",
    args: [userId],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return { tenant_id: String(r.tenant_id), role: r.role as MembershipRole, tenant_user_id: Number(r.tenant_user_id) };
}
```

- [ ] **Step 5: Update `resolveLogin` to return the tenant-local id**

In `lib/auth/login.ts`, change the returned `userId`:

```ts
  const role: "admin" | "team" = membership.role === "practitioner" ? "team" : "admin";
  return { userId: membership.tenant_user_id, tenantId: membership.tenant_id, role, name: user.name };
```

- [ ] **Step 6: Update the dev bootstrap to link to the real tenant user**

Replace the body of `main()` in `scripts/bootstrap-dev-tenant.ts` so it resolves (or creates) the tenant-local user and stores its id in the membership:

```ts
import { runControlMigrations } from "./migrate-control";
import { upsertTenant, createControlUser, addMembership, findControlUserByEmail } from "../lib/control-users";
import { getTenantDb, runWithDb } from "../lib/db";
import { runMigrations } from "./migrate";
import { findUserByEmail, createUser } from "../lib/users";

const EMAIL = process.env.DEV_OWNER_EMAIL || "lorna@clinic.test";
const PASSWORD = process.env.DEV_OWNER_PASSWORD || "lorna123";
const NAME = process.env.DEV_OWNER_NAME || "Lorna Driver-Davies";
const TENANT_ID = process.env.DEV_TENANT_ID || "lorna-dev";
const TENANT_DB = process.env.DEV_TENANT_DB_URL || "file:local.db";

async function main() {
  await runControlMigrations();
  await upsertTenant({ id: TENANT_ID, name: "Lorna Clinic (dev)", dbUrl: TENANT_DB });

  // Resolve (or create) the tenant-local user record the clinical tables reference.
  const tenantClient = await getTenantDb(TENANT_ID);
  const tenantUserId = await runWithDb(tenantClient, async () => {
    await runMigrations();
    const existing = await findUserByEmail(EMAIL);
    if (existing) return existing.id;
    return createUser({ email: EMAIL, password: PASSWORD, role: "admin", name: NAME });
  });

  const control = await findControlUserByEmail(EMAIL);
  const uid = control ? control.id : await createControlUser({ email: EMAIL, password: PASSWORD, name: NAME });
  await addMembership({ userId: uid, tenantId: TENANT_ID, role: "owner", tenantUserId });
  console.log(`control ready: tenant=${TENANT_ID} db=${TENANT_DB} login=${EMAIL} tenantUserId=${tenantUserId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: Update the existing control-users/login tests for the new `addMembership` shape**

In `test/control-users.test.ts` and `test/login-resolver.test.ts`, every `addMembership({ userId, tenantId, role })` call gains `tenantUserId: <n>` (use the same number as `userId` where the test doesn't care, e.g. `tenantUserId: uid`). In `test/login-resolver.test.ts`, the "owner mapped to admin" expectation already uses `toMatchObject` without `userId`, so it still passes; where a test asserts a specific `userId`, set `tenantUserId` to the value it expects.

- [ ] **Step 8: Run tests, typecheck, full suite + commit**

```bash
npx vitest run test/identity-bridge.test.ts test/control-users.test.ts test/login-resolver.test.ts
npx tsc --noEmit
npm test
```
Then re-run the dev bootstrap so the dev membership gets a real `tenant_user_id`:
```bash
rm -f control.db && npm run bootstrap:dev
```
Commit:
```bash
git add lib/control-schema.sql scripts/migrate-control.ts lib/control-users.ts lib/auth/login.ts scripts/bootstrap-dev-tenant.ts test/identity-bridge.test.ts test/control-users.test.ts test/login-resolver.test.ts
git commit -m "feat: identity bridge — session.userId is the tenant-local user id"
```

---

### Task 3 [no token]: Generic starter-seed for a new clinic

**Files:**
- Create: `scripts/seed-starter.ts`
- Test: `test/seed-starter.test.ts`

**Interfaces:**
- Produces: `seedStarterData(): Promise<void>` — seeds generic dosing presets + note snippets into the *active* tenant DB (idempotent). No brands/products (a new clinic uploads its own library).
- Consumes: `query`/`execute` (tenant-aware).

- [ ] **Step 1: Write the failing test**

```ts
// test/seed-starter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runWithDb, query } from "@/lib/db";
import { runMigrations } from "@/scripts/migrate";
import { seedStarterData } from "@/scripts/seed-starter";

describe("starter seed", () => {
  it("seeds generic dosing presets + note snippets, no brands, idempotently", async () => {
    const db = createClient({ url: ":memory:" });
    await runWithDb(db, async () => {
      await runMigrations();
      await seedStarterData();
      await seedStarterData(); // idempotent
      const presets = await query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets");
      const snippets = await query<{ n: number }>("SELECT COUNT(*) AS n FROM note_snippets");
      const brands = await query<{ n: number }>("SELECT COUNT(*) AS n FROM brands");
      expect(presets[0].n).toBeGreaterThan(0);
      expect(snippets[0].n).toBeGreaterThan(0);
      expect(brands[0].n).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/seed-starter.test.ts`
Expected: FAIL — `@/scripts/seed-starter` not found.

- [ ] **Step 3: Create `scripts/seed-starter.ts`**

```ts
import { query, execute } from "@/lib/db";

const DOSING = [
  { label: "1 capsule with breakfast", text: "Take 1 capsule with breakfast." },
  { label: "2 capsules with food", text: "Take 2 capsules with food." },
  { label: "1 capsule with evening meal", text: "Take 1 capsule with your evening meal." },
  { label: "As directed", text: "Take as directed by your practitioner." },
];

const SNIPPETS = [
  { text: "Take away from medications by at least 2 hours.", category: "supplement" },
  { text: "Best taken with food to support absorption.", category: "supplement" },
  { text: "Review at your next consultation.", category: "general" },
];

export async function seedStarterData(): Promise<void> {
  for (const d of DOSING) {
    const exists = await query<{ id: number }>("SELECT id FROM dosing_presets WHERE label = ?", [d.label]);
    if (exists.length === 0) await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [d.label, d.text]);
  }
  for (const s of SNIPPETS) {
    const exists = await query<{ id: number }>("SELECT id FROM note_snippets WHERE text = ?", [s.text]);
    if (exists.length === 0) await execute("INSERT INTO note_snippets (text, category) VALUES (?, ?)", [s.text, s.category]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

```bash
npx vitest run test/seed-starter.test.ts
git add scripts/seed-starter.ts test/seed-starter.test.ts
git commit -m "feat: generic starter-seed (dosing presets + note snippets) for new clinics"
```

---

### Task 4 [needs Turso token]: Turso Platform API client

**Files:**
- Create: `lib/tenancy/turso.ts`
- Test: `test/turso-client.test.ts` (mocked `fetch`, no network)

**Interfaces:**
- Produces: `createTursoDatabase(name: string): Promise<{ url: string; authToken: string }>` — creates a DB in the configured org/group and mints an auth token.
- Produces: `deleteTursoDatabase(name: string): Promise<void>` — for rollback/cleanup.
- Reads env: `TURSO_PLATFORM_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`.

- [ ] **Step 1: Write the failing test (mock fetch)**

```ts
// test/turso-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = { TURSO_PLATFORM_TOKEN: "tok", TURSO_ORG: "acme", TURSO_GROUP: "default" };

describe("turso platform client", () => {
  beforeEach(() => { Object.assign(process.env, ENV); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("creates a database then mints a token, returning the libsql url", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if (url.endsWith("/databases")) {
        return new Response(JSON.stringify({ database: { Hostname: "clinic-x-acme.turso.io" } }), { status: 200 });
      }
      if (url.endsWith("/auth/tokens")) {
        return new Response(JSON.stringify({ jwt: "db-jwt" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));
    const { createTursoDatabase } = await import("@/lib/tenancy/turso");
    const out = await createTursoDatabase("clinic-x");
    expect(out.url).toBe("libsql://clinic-x-acme.turso.io");
    expect(out.authToken).toBe("db-jwt");
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/databases"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/turso-client.test.ts`
Expected: FAIL — `@/lib/tenancy/turso` not found.

- [ ] **Step 3: Create `lib/tenancy/turso.ts`**

```ts
const BASE = "https://api.turso.tech/v1";

function cfg() {
  const token = process.env.TURSO_PLATFORM_TOKEN;
  const org = process.env.TURSO_ORG;
  const group = process.env.TURSO_GROUP || "default";
  if (!token || !org) throw new Error("TURSO_PLATFORM_TOKEN and TURSO_ORG must be set");
  return { token, org, group };
}

async function api(path: string, init: RequestInit): Promise<any> {
  const { token } = cfg();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Turso API ${init.method || "GET"} ${path} -> ${res.status}`);
  return res.json();
}

export async function createTursoDatabase(name: string): Promise<{ url: string; authToken: string }> {
  const { org, group } = cfg();
  const created = await api(`/organizations/${org}/databases`, {
    method: "POST",
    body: JSON.stringify({ name, group }),
  });
  const hostname: string = created.database?.Hostname || created.database?.hostname;
  if (!hostname) throw new Error("Turso create: no hostname in response");
  const tokenRes = await api(`/organizations/${org}/databases/${name}/auth/tokens`, { method: "POST", body: "{}" });
  const jwt: string = tokenRes.jwt;
  if (!jwt) throw new Error("Turso token: no jwt in response");
  return { url: `libsql://${hostname}`, authToken: jwt };
}

export async function deleteTursoDatabase(name: string): Promise<void> {
  const { org } = cfg();
  await api(`/organizations/${org}/databases/${name}`, { method: "DELETE" });
}
```

> Verify the exact Turso Platform API response shape against current docs when the token is in hand; adjust `created.database.Hostname` / token field if the API differs. The test mocks the shape this code expects.

- [ ] **Step 4: Run test to verify it passes + commit**

```bash
npx vitest run test/turso-client.test.ts
git add lib/tenancy/turso.ts test/turso-client.test.ts
git commit -m "feat: Turso Platform API client (create/delete DB + token)"
```

---

### Task 5 [needs Turso token]: Provisioning + provisioning_jobs

**Files:**
- Modify: `lib/control-schema.sql` (add `provisioning_jobs`)
- Create: `lib/tenancy/provision.ts`
- Test: `test/provision.test.ts` (inject a fake DB-creator so no network)

**Interfaces:**
- Produces: `provisionTenant(input: { tenantId: string; clinicName: string; ownerEmail: string; ownerName: string; ownerPassword: string }, deps?: { createDb?: typeof createTursoDatabase }): Promise<{ tenantId: string; tenantUserId: number }>` — creates the DB (via `deps.createDb`, defaulting to the real Turso client), runs schema, seeds starter data, creates the owner in the tenant `users` table + control-plane + membership, advancing a `provisioning_jobs` row to `done`.
- Consumes: `createTursoDatabase` (Task 4), `upsertTenant`/`createControlUser`/`addMembership` ([lib/control-users.ts](../../../lib/control-users.ts)), `getTenantDb`/`runWithDb`, `runMigrations`, `seedStarterData` (Task 3), `createUser` ([lib/users.ts](../../../lib/users.ts)).

- [ ] **Step 1: Write the failing test (inject a local file DB as the "created" DB)**

```ts
// test/provision.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb, query } from "@/lib/db";
import { provisionTenant } from "@/lib/tenancy/provision";
import { resolveLogin } from "@/lib/auth/login";

async function resetControl() {
  const db = getControlDb();
  for (const t of ["memberships", "users", "tenants", "provisioning_jobs"]) await db.execute(`DROP TABLE IF EXISTS ${t}`);
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("provisionTenant", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-prov.db"), { force: true });
    await resetControl();
  });

  it("creates an isolated DB, seeds starter data, and the owner can log in", async () => {
    const out = await provisionTenant(
      { tenantId: "acme", clinicName: "Acme Nutrition", ownerEmail: "o@acme.test", ownerName: "Owner", ownerPassword: "pw" },
      { createDb: async () => ({ url: "file:test-prov.db", authToken: "" }) }
    );
    expect(out.tenantId).toBe("acme");

    // Starter data is present in the new tenant DB.
    const tdb = await getTenantDb("acme");
    const presets = await runWithDb(tdb, () => query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets"));
    expect(presets[0].n).toBeGreaterThan(0);

    // The owner can authenticate and lands on the tenant with a real local user id.
    const session = await resolveLogin("o@acme.test", "pw");
    expect(session?.tenantId).toBe("acme");
    expect(session?.userId).toBe(out.tenantUserId);

    // Job completed.
    const job = await getControlDb().execute("SELECT state FROM provisioning_jobs WHERE tenant_id = 'acme'");
    expect(String(job.rows[0].state)).toBe("done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/provision.test.ts`
Expected: FAIL — `@/lib/tenancy/provision` not found.

- [ ] **Step 3: Add `provisioning_jobs` to `lib/control-schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','db_created','schema_done','seeded','done','failed')),
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `lib/tenancy/provision.ts`**

```ts
import { getControlDb, getTenantDb, runWithDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership, findControlUserByEmail } from "@/lib/control-users";
import { runMigrations } from "@/scripts/migrate";
import { seedStarterData } from "@/scripts/seed-starter";
import { createUser, findUserByEmail } from "@/lib/users";
import { createTursoDatabase } from "@/lib/tenancy/turso";

async function setJob(tenantId: string, state: string, error?: string) {
  await getControlDb().execute({
    sql: `INSERT INTO provisioning_jobs (tenant_id, state, error, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    args: [tenantId, state, error ?? null],
  });
}

export async function provisionTenant(
  input: { tenantId: string; clinicName: string; ownerEmail: string; ownerName: string; ownerPassword: string },
  deps: { createDb?: typeof createTursoDatabase } = {}
): Promise<{ tenantId: string; tenantUserId: number }> {
  const createDb = deps.createDb ?? createTursoDatabase;
  try {
    await setJob(input.tenantId, "pending");
    const { url, authToken } = await createDb(input.tenantId);
    await upsertTenant({ id: input.tenantId, name: input.clinicName, dbUrl: url, dbAuthToken: authToken || undefined });
    await setJob(input.tenantId, "db_created");

    const tenantClient = await getTenantDb(input.tenantId);
    const tenantUserId = await runWithDb(tenantClient, async () => {
      await runMigrations();
      await setJob(input.tenantId, "schema_done");
      await seedStarterData();
      await setJob(input.tenantId, "seeded");
      const existing = await findUserByEmail(input.ownerEmail);
      if (existing) return existing.id;
      return createUser({ email: input.ownerEmail, password: input.ownerPassword, role: "admin", name: input.ownerName });
    });

    const control = await findControlUserByEmail(input.ownerEmail);
    const uid = control ? control.id : await createControlUser({ email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName });
    await addMembership({ userId: uid, tenantId: input.tenantId, role: "owner", tenantUserId });

    await setJob(input.tenantId, "done");
    return { tenantId: input.tenantId, tenantUserId };
  } catch (e) {
    await setJob(input.tenantId, "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}
```

- [ ] **Step 5: Run tests, typecheck, full suite + commit**

```bash
npx vitest run test/provision.test.ts
npx tsc --noEmit
npm test
git add lib/control-schema.sql lib/tenancy/provision.ts test/provision.test.ts
git commit -m "feat: tenant provisioning (DB + schema + starter seed + owner) with job tracking"
```

---

## Self-Review

**Spec coverage (spec §3.4 provisioning + migrations, §3.2/§3.3 identity):**
- Tenant-aware migration runner → Task 1. ✓
- `session.userId` matches tenant tables (correctness for provisioned clinics) → Task 2 identity bridge. ✓
- Create tenant DB via Turso Platform API → Task 4. ✓
- Provision: DB + schema + starter seed + owner, retryable job → Tasks 3 (seed) + 5 (provision + `provisioning_jobs`). ✓
- Signup UI + onboarding wizard → **deferred to Plan 0d** (this plan is the provisioning backend).

**Placeholder scan:** No TBD/TODO. Turso API shape carries an explicit "verify against current docs" note with a mocked contract; that is a known external-API caveat, not a placeholder in our code.

**Type consistency:** `addMembership` gains `tenantUserId` (Task 2) and every caller is updated (Task 2 Step 7, Task 5). `findPrimaryMembership` returns `tenant_user_id`; `resolveLogin` reads it. `createTursoDatabase` signature (Task 4) matches the `deps.createDb` type and default in `provisionTenant` (Task 5). `seedStarterData`/`runMigrations` run inside `runWithDb` in both the runner and provisioning.

**Build order:** Tasks 1–3 need no token and are safe to build now. Tasks 4–5 need the free `TURSO_PLATFORM_TOKEN` (+ `TURSO_ORG`) — their tests mock/inject so they can be written and pass without a real token, but a real provisioning run needs the token.
