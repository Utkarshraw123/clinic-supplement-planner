# Phase 0a — Tenant-Aware Data Layer + Control-Plane + Global Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-database app into a multi-tenant one: a shared control-plane database holds global identity + a tenant registry, every clinical query runs against the signed-in user's own tenant database, and two tenants provably cannot see each other's data.

**Architecture:** Add a **control-plane** libSQL database (`tenants`, `users`, `memberships`). Refactor [lib/db.ts](../../../lib/db.ts) so the existing `query()`/`execute()` run against an *active tenant client* resolved either from an `AsyncLocalStorage` context (tests, scripts) or from the signed-in session cookie (requests). The session JWT gains `tenantId`; its `role` field stays `"admin"|"team"` (derived from the membership role) so all existing role checks keep working unchanged. Login authenticates against the control-plane and resolves the user's tenant.

**Tech Stack:** Next.js 14 (app router), `@libsql/client`, `jose` (JWT), `bcryptjs`, `vitest`, `tsx`.

## Global Constraints

- Keep the existing `query(sql, args)` / `execute(sql, args)` signatures (18 modules import them from `@/lib/db`) — do not rename or change their call shape.
- Session `role` field stays the union `"admin" | "team"` — the 7 existing `role === "admin"` call sites must not need edits.
- Control-plane DB URL comes from `CONTROL_DATABASE_URL` (default `file:control.db` in dev). Tenant DB URL/token are stored per-tenant in the control-plane `tenants` row.
- EU residency: production tenant/control DBs live in the Turso Dublin region (enforced at provisioning time in Phase 0b; no code constant here).
- All new code is TypeScript, matches existing style (2-space indent, no semicolon-free style — existing files use semicolons).
- Run the full suite with `npm test` (vitest). It must stay green.

---

### Task 1: Control-plane schema + connection

**Files:**
- Create: `lib/control-schema.sql`
- Modify: `lib/db.ts` (add `getControlDb`)
- Create: `scripts/migrate-control.ts`
- Test: `test/control-db.test.ts`

**Interfaces:**
- Produces: `getControlDb(): Client` in `lib/db.ts` — the control-plane libSQL client (singleton per URL).
- Produces: `lib/control-schema.sql` defining tables `tenants`, `users`, `memberships`.
- Produces: `runControlMigrations(): Promise<void>` in `scripts/migrate-control.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// test/control-db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("control-plane schema", () => {
  it("creates tenants, users and memberships tables", async () => {
    const db = createClient({ url: ":memory:" });
    const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt);
    }
    const tables = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.rows.map((r) => String(r.name));
    expect(names).toContain("tenants");
    expect(names).toContain("users");
    expect(names).toContain("memberships");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/control-db.test.ts`
Expected: FAIL — `ENOENT` opening `lib/control-schema.sql`.

- [ ] **Step 3: Create the control-plane schema**

```sql
-- lib/control-schema.sql
-- One row per clinic. Points at that clinic's own libSQL database.
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,                 -- slug, e.g. "lorna"
  name TEXT NOT NULL,
  db_url TEXT NOT NULL,
  db_auth_token TEXT,                  -- null for local file DBs
  region TEXT NOT NULL DEFAULT 'dublin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('provisioning','active','suspended','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Global login identity (login happens against this table, not a tenant DB).
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tenant_id)
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/control-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `getControlDb` and the migration runner**

Add to `lib/db.ts` (above the existing `getDb`):

```ts
const _clients = new Map<string, Client>();
function client(url: string, authToken?: string): Client {
  const key = `${url}::${authToken ?? ""}`;
  let c = _clients.get(key);
  if (!c) {
    c = createClient({ url, authToken });
    _clients.set(key, c);
  }
  return c;
}

export function getControlDb(): Client {
  const url = process.env.CONTROL_DATABASE_URL || "file:control.db";
  return client(url, process.env.CONTROL_AUTH_TOKEN || undefined);
}
```

Create `scripts/migrate-control.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "../lib/db";

export async function runControlMigrations(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  const db = getControlDb();
  for (const stmt of statements) await db.execute(stmt);
}

if (process.argv[1] && process.argv[1].endsWith("migrate-control.ts")) {
  runControlMigrations()
    .then(() => { console.log("control migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/control-schema.sql scripts/migrate-control.ts lib/db.ts test/control-db.test.ts
git commit -m "feat: control-plane schema + getControlDb"
```

---

### Task 2: Tenant-aware query layer (ALS + session fallback)

**Files:**
- Modify: `lib/db.ts`
- Test: `test/tenant-isolation.test.ts`

**Interfaces:**
- Produces: `getTenantDb(tenantId: string): Promise<Client>` — resolves a tenant's client from its control-plane row.
- Produces: `runWithDb<T>(c: Client, fn: () => Promise<T> | T): Promise<T> | T` — runs `fn` with `c` as the active client (for tests/scripts).
- Produces: unchanged `query(sql, args)` / `execute(sql, args)` that now target the active client (ALS first, then session-cookie tenant).
- Consumes: `getControlDb` (Task 1).

- [ ] **Step 1: Write the failing isolation test**

```ts
// test/tenant-isolation.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { runWithDb, query, execute } from "@/lib/db";

async function makeTenant() {
  const c = createClient({ url: ":memory:" });
  await c.execute("CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT)");
  return c;
}

describe("tenant isolation via active client", () => {
  it("each tenant only sees its own rows", async () => {
    const a = await makeTenant();
    const b = await makeTenant();

    await runWithDb(a, () => execute("INSERT INTO patients (name) VALUES (?)", ["Alice"]));
    await runWithDb(b, () => execute("INSERT INTO patients (name) VALUES (?)", ["Bob"]));

    const aRows = await runWithDb(a, () => query<{ name: string }>("SELECT name FROM patients"));
    const bRows = await runWithDb(b, () => query<{ name: string }>("SELECT name FROM patients"));

    expect(aRows.map((r) => r.name)).toEqual(["Alice"]);
    expect(bRows.map((r) => r.name)).toEqual(["Bob"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tenant-isolation.test.ts`
Expected: FAIL — `runWithDb` is not exported.

- [ ] **Step 3: Rewrite `lib/db.ts` query layer**

Replace the whole file body with:

```ts
import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/session";

const _clients = new Map<string, Client>();
function client(url: string, authToken?: string): Client {
  const key = `${url}::${authToken ?? ""}`;
  let c = _clients.get(key);
  if (!c) {
    c = createClient({ url, authToken });
    _clients.set(key, c);
  }
  return c;
}

export function getControlDb(): Client {
  const url = process.env.CONTROL_DATABASE_URL || "file:control.db";
  return client(url, process.env.CONTROL_AUTH_TOKEN || undefined);
}

export async function getTenantDb(tenantId: string): Promise<Client> {
  const rs = await getControlDb().execute({
    sql: "SELECT db_url, db_auth_token FROM tenants WHERE id = ?",
    args: [tenantId],
  });
  const row = rs.rows[0];
  if (!row) throw new Error(`unknown tenant: ${tenantId}`);
  return client(String(row.db_url), row.db_auth_token ? String(row.db_auth_token) : undefined);
}

const dbStore = new AsyncLocalStorage<Client>();
export function runWithDb<T>(c: Client, fn: () => T): T {
  return dbStore.run(c, fn);
}

// Request-only: read the tenant id from the signed-in session cookie.
async function tenantIdFromSession(): Promise<string | null> {
  try {
    const token = cookies().get("sess")?.value;
    if (!token) return null;
    const s = await verifySession(token);
    return s?.tenantId ?? null;
  } catch {
    return null; // not in a request context (e.g. a script)
  }
}

async function activeClient(): Promise<Client> {
  const fromAls = dbStore.getStore();
  if (fromAls) return fromAls;
  const tid = await tenantIdFromSession();
  if (tid) return getTenantDb(tid);
  throw new Error("no active tenant: not inside runWithDb and no tenant session");
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await (await activeClient()).execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  return (await activeClient()).execute({ sql, args });
}
```

> Note: `verifySession` gains a `tenantId` field in Task 3; until then this file will not type-check against the old `SessionPayload`. Do Task 3 before running the full suite.

- [ ] **Step 4: Run the isolation test to verify it passes**

Run: `npx vitest run test/tenant-isolation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts test/tenant-isolation.test.ts
git commit -m "feat: tenant-aware query layer with ALS + session fallback"
```

---

### Task 3: Session carries tenantId

**Files:**
- Modify: `lib/auth/session.ts`
- Test: `test/session.test.ts`

**Interfaces:**
- Produces: `SessionPayload = { userId: number; tenantId: string; role: "admin" | "team"; name: string }`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// test/session.test.ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";

describe("session with tenant", () => {
  it("round-trips tenantId", async () => {
    const token = await signSession({ userId: 1, tenantId: "lorna", role: "admin", name: "Lorna" });
    const s = await verifySession(token);
    expect(s).toEqual({ userId: 1, tenantId: "lorna", role: "admin", name: "Lorna" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session.test.ts`
Expected: FAIL — `tenantId` missing from the returned payload / type error.

- [ ] **Step 3: Update `lib/auth/session.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = {
  userId: number;
  tenantId: string;
  role: "admin" | "team";
  name: string;
};

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me-32-characters!");
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.tenantId) return null;
    return {
      userId: Number(payload.userId),
      tenantId: String(payload.tenantId),
      role: payload.role as "admin" | "team",
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts test/session.test.ts
git commit -m "feat: session payload carries tenantId"
```

---

### Task 4: Control-plane identity module

**Files:**
- Create: `lib/control-users.ts`
- Test: `test/control-users.test.ts`

**Interfaces:**
- Produces:
  - `createControlUser(input: { email: string; password: string; name: string }): Promise<number>`
  - `findControlUserByEmail(email: string): Promise<{ id: number; email: string; password_hash: string; name: string } | null>`
  - `addMembership(input: { userId: number; tenantId: string; role: "owner"|"admin"|"practitioner" }): Promise<void>`
  - `findPrimaryMembership(userId: number): Promise<{ tenant_id: string; role: "owner"|"admin"|"practitioner" } | null>`
  - `upsertTenant(input: { id: string; name: string; dbUrl: string; dbAuthToken?: string }): Promise<void>`
- Consumes: `getControlDb` (Task 1), `hashPassword` ([lib/auth/password.ts](../../../lib/auth/password.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/control-users.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// We point getControlDb at an in-memory DB by overriding the module's client cache
// through CONTROL_DATABASE_URL is not possible for :memory: across calls, so test
// the SQL via the exported functions using a real temp file DB.
import { createControlUser, findControlUserByEmail, addMembership, findPrimaryMembership, upsertTenant } from "@/lib/control-users";
import { getControlDb } from "@/lib/db";

beforeEach(async () => {
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
});

describe("control-plane identity", () => {
  it("creates a user, tenant, membership and resolves them", async () => {
    await upsertTenant({ id: "lorna", name: "Lorna Clinic", dbUrl: "file:local.db" });
    const uid = await createControlUser({ email: "L@x.com", password: "pw", name: "Lorna" });
    await addMembership({ userId: uid, tenantId: "lorna", role: "owner" });

    const found = await findControlUserByEmail("l@x.com");
    expect(found?.id).toBe(uid);

    const m = await findPrimaryMembership(uid);
    expect(m).toEqual({ tenant_id: "lorna", role: "owner" });
  });
});
```

Set the control DB to a temp file for this test file by adding to the top of the test (before imports run side effects is not possible, so set in a `vitest` setup). Simplest: create `test/setup.control.ts` and reference it — but to keep this task self-contained, set `process.env.CONTROL_DATABASE_URL = "file:test-control.db"` in `vitest.config.ts` `test.env` (see Step 3b).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/control-users.test.ts`
Expected: FAIL — module `@/lib/control-users` not found.

- [ ] **Step 3: Create `lib/control-users.ts`**

```ts
import { getControlDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export async function upsertTenant(input: { id: string; name: string; dbUrl: string; dbAuthToken?: string }): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO tenants (id, name, db_url, db_auth_token) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, db_url=excluded.db_url, db_auth_token=excluded.db_auth_token`,
    args: [input.id, input.name, input.dbUrl, input.dbAuthToken ?? null],
  });
}

export async function createControlUser(input: { email: string; password: string; name: string }): Promise<number> {
  const hash = await hashPassword(input.password);
  const rs = await getControlDb().execute({
    sql: "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
    args: [input.email.toLowerCase().trim(), hash, input.name.trim()],
  });
  return Number(rs.lastInsertRowid);
}

export async function findControlUserByEmail(email: string) {
  const rs = await getControlDb().execute({
    sql: "SELECT id, email, password_hash, name FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return { id: Number(r.id), email: String(r.email), password_hash: String(r.password_hash), name: String(r.name) };
}

export async function addMembership(input: { userId: number; tenantId: string; role: "owner"|"admin"|"practitioner" }): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?)
          ON CONFLICT(user_id, tenant_id) DO UPDATE SET role=excluded.role`,
    args: [input.userId, input.tenantId, input.role],
  });
}

export async function findPrimaryMembership(userId: number) {
  const rs = await getControlDb().execute({
    sql: "SELECT tenant_id, role FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1",
    args: [userId],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return { tenant_id: String(r.tenant_id), role: r.role as "owner"|"admin"|"practitioner" };
}
```

- [ ] **Step 3b: Point the test control DB at a temp file**

Modify `vitest.config.ts` to add `test.env`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    env: { CONTROL_DATABASE_URL: "file:test-control.db" },
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
```

(Adjust to preserve any existing fields in the real file; only add `env`.) Add `test-control.db` to `.gitignore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/control-users.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/control-users.ts test/control-users.test.ts vitest.config.ts .gitignore
git commit -m "feat: control-plane identity module (users, tenants, memberships)"
```

---

### Task 5: Login against the control-plane

**Files:**
- Modify: `app/api/login/route.ts`
- Create: `lib/auth/login.ts` (pure resolver, unit-testable without HTTP)
- Test: `test/login-resolver.test.ts`

**Interfaces:**
- Produces: `resolveLogin(email: string, password: string): Promise<SessionPayload | null>` in `lib/auth/login.ts` — authenticates against control users, resolves primary membership, derives session role (`owner`/`admin` → `"admin"`, `practitioner` → `"team"`).
- Consumes: `findControlUserByEmail`, `findPrimaryMembership` (Task 4), `verifyPassword` ([lib/auth/password.ts](../../../lib/auth/password.ts)), `SessionPayload` (Task 3).

- [ ] **Step 1: Write the failing test**

```ts
// test/login-resolver.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership } from "@/lib/control-users";
import { resolveLogin } from "@/lib/auth/login";

beforeEach(async () => {
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
  await upsertTenant({ id: "lorna", name: "Lorna", dbUrl: "file:local.db" });
  const uid = await createControlUser({ email: "l@x.com", password: "pw", name: "Lorna" });
  await addMembership({ userId: uid, tenantId: "lorna", role: "owner" });
});

describe("resolveLogin", () => {
  it("returns a session for valid credentials, owner mapped to admin", async () => {
    const s = await resolveLogin("l@x.com", "pw");
    expect(s).toMatchObject({ tenantId: "lorna", role: "admin", name: "Lorna" });
  });
  it("returns null for a wrong password", async () => {
    expect(await resolveLogin("l@x.com", "nope")).toBeNull();
  });
  it("returns null for an unknown email", async () => {
    expect(await resolveLogin("ghost@x.com", "pw")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/login-resolver.test.ts`
Expected: FAIL — `@/lib/auth/login` not found.

- [ ] **Step 3: Create `lib/auth/login.ts`**

```ts
import { findControlUserByEmail, findPrimaryMembership } from "@/lib/control-users";
import { verifyPassword } from "@/lib/auth/password";
import type { SessionPayload } from "@/lib/auth/session";

export async function resolveLogin(email: string, password: string): Promise<SessionPayload | null> {
  const user = await findControlUserByEmail(email);
  if (!user) return null;
  if (!(await verifyPassword(password, user.password_hash))) return null;
  const membership = await findPrimaryMembership(user.id);
  if (!membership) return null;
  const role: "admin" | "team" = membership.role === "practitioner" ? "team" : "admin";
  return { userId: user.id, tenantId: membership.tenant_id, role, name: user.name };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/login-resolver.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Wire the route to the resolver**

Replace `app/api/login/route.ts` body:

```ts
import { NextResponse } from "next/server";
import { resolveLogin } from "@/lib/auth/login";
import { signSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const session = await resolveLogin(String(email ?? ""), String(password ?? ""));
  if (!session) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = await signSession(session);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (new tests green; pre-existing tests still green — note some pre-existing tests may call `query`/`execute` outside a request/`runWithDb`; if any fail with "no active tenant", wrap their DB setup in `runWithDb(getTenantDb(...))` or a `:memory:` client — fix those in Task 6).

- [ ] **Step 7: Commit**

```bash
git add app/api/login/route.ts lib/auth/login.ts test/login-resolver.test.ts
git commit -m "feat: authenticate login against control-plane + membership"
```

---

### Task 6: Dev bootstrap — adopt the existing DB as tenant #1 and green the suite

**Files:**
- Create: `scripts/bootstrap-dev-tenant.ts`
- Modify: any pre-existing test that calls `query`/`execute` without an active client (wrap in `runWithDb`)
- Test: `test/active-tenant-guard.test.ts`

**Interfaces:**
- Produces: `scripts/bootstrap-dev-tenant.ts` — creates the control DB schema, registers `local.db` as tenant `lorna-dev`, and creates a control user + owner membership from an email/password so you can log in and hit existing routes.
- Consumes: `runControlMigrations` (Task 1), `upsertTenant`, `createControlUser`, `addMembership` (Task 4).

- [ ] **Step 1: Write the failing guard test**

```ts
// test/active-tenant-guard.test.ts
import { describe, it, expect } from "vitest";
import { query } from "@/lib/db";

describe("active tenant guard", () => {
  it("throws a clear error when no tenant is active", async () => {
    await expect(query("SELECT 1")).rejects.toThrow(/no active tenant/);
  });
});
```

- [ ] **Step 2: Run test to verify it passes already (documents the contract)**

Run: `npx vitest run test/active-tenant-guard.test.ts`
Expected: PASS (the guard was added in Task 2). If it FAILS, the ALS/session fallback in `lib/db.ts` is wrong — fix before continuing.

- [ ] **Step 3: Create the dev bootstrap script**

```ts
// scripts/bootstrap-dev-tenant.ts
import { runControlMigrations } from "./migrate-control";
import { upsertTenant, createControlUser, addMembership, findControlUserByEmail } from "../lib/control-users";

const EMAIL = process.env.DEV_OWNER_EMAIL || "lorna@clinic.test";
const PASSWORD = process.env.DEV_OWNER_PASSWORD || "lorna123";
const NAME = process.env.DEV_OWNER_NAME || "Lorna Driver-Davies";
const TENANT_ID = process.env.DEV_TENANT_ID || "lorna-dev";
const TENANT_DB = process.env.DEV_TENANT_DB_URL || "file:local.db";

async function main() {
  await runControlMigrations();
  await upsertTenant({ id: TENANT_ID, name: "Lorna Clinic (dev)", dbUrl: TENANT_DB });
  let user = await findControlUserByEmail(EMAIL);
  const uid = user ? user.id : await createControlUser({ email: EMAIL, password: PASSWORD, name: NAME });
  await addMembership({ userId: uid, tenantId: TENANT_ID, role: "owner" });
  console.log(`control ready: tenant=${TENANT_ID} db=${TENANT_DB} login=${EMAIL}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

Add an npm script to `package.json`:

```json
"bootstrap:dev": "tsx scripts/bootstrap-dev-tenant.ts"
```

- [ ] **Step 4: Fix any pre-existing tests that hit the DB without an active client**

Run: `npm test`
For each failing test that errors with `no active tenant`, wrap its DB access:

```ts
import { runWithDb } from "@/lib/db";
import { createClient } from "@libsql/client";
// ...
const db = createClient({ url: ":memory:" });
// (create the needed schema on db)
await runWithDb(db, async () => {
  // the test body that calls query()/execute()
});
```

Repeat until `npm test` is green. (Do not weaken the guard; the correct fix is wrapping the test, not removing the throw.)

- [ ] **Step 5: Manual smoke (dev)**

Run:
```bash
rm -f control.db
npm run bootstrap:dev
npm run migrate   # ensures local.db clinical schema exists
```
Then `preview_start` the dev server and log in with `lorna@clinic.test` / `lorna123`. Confirm the dashboard, patients, catalog and plans pages load (they now read `local.db` via the `lorna-dev` tenant). Note: the pre-existing login path previously used the tenant `users` table; after this change login uses the control-plane, so the dev owner above is the credential to use.

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap-dev-tenant.ts package.json test/active-tenant-guard.test.ts test/
git commit -m "feat: dev bootstrap adopts local.db as tenant #1; green suite under tenant layer"
```

---

## Self-Review

**Spec coverage (Phase 0a slice of the spec):**
- §3.1 database-per-tenant registry → Task 1 (`tenants`) + Task 2 (`getTenantDb`). ✓
- §3.2 request→tenant resolution + `lib/db.ts` refactor → Task 2 (ALS + session fallback). ✓
- §3.3 global identity + memberships + roles, session carries tenant → Tasks 3, 4, 5. ✓
- §3.6 adopt existing DB as tenant #1 (dev reference) → Task 6. ✓
- Billing (§3.5), provisioning (§3.4), signup (§4 app), GDPR actions (§3.7) → deliberately **out of 0a**, covered by plans 0b–0e.

**Placeholder scan:** No TBD/TODO; every code step has complete code. The only forward-reference note (Task 2 Step 3 depends on Task 3's `tenantId`) is called out explicitly with instruction to do Task 3 before running the suite.

**Type consistency:** `SessionPayload` (Task 3) is consumed unchanged by `resolveLogin` (Task 5). `findPrimaryMembership` returns `{ tenant_id, role }` and `resolveLogin` reads exactly those names. `getTenantDb` returns `Promise<Client>`; `activeClient`/`runWithDb` use `Client` consistently. Membership role union `owner|admin|practitioner` is identical in Task 4 and Task 5.

**Known follow-ups for 0b (not gaps in 0a):** `scripts/migrate.ts` still targets a single DB via `query`/`execute`; under the new layer it must run inside `runWithDb(getTenantDb(id))` or be refactored to take a client — handled in Plan 0b's tenant-aware migration runner.
