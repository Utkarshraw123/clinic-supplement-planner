# Supplement Selection Database — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the clinic supplement tool — project scaffold, email/password auth with roles, the Turso data layer, controlled taxonomies, and the full product catalog (brands, products, tags, supplier links, alternatives, search, import) — as a usable, tested catalog app.

**Architecture:** Next.js 14 App Router on Turso (libSQL) with raw parameterised SQL and no ORM. Server actions + route handlers for mutations; bcrypt password hashing with HTTP-only signed session cookies; role guards (`admin`/`team`). Controlled-vocabulary taxonomy tables back all clinical tags so later flagging is deterministic. External calls (email, later) degrade to mock mode without keys.

**Tech Stack:** Next.js 14, TypeScript, `@libsql/client`, Vitest, bcryptjs, `jose` (session JWT), `papaparse` (CSV import), Tailwind CSS + design tokens (UI UX Pro Max skill baseline).

## Global Constraints

- Runtime: Next.js 14 App Router, Node 20+, TypeScript strict mode.
- Database: Turso (libSQL) via `@libsql/client`. Raw parameterised SQL only, no ORM. Every db function is `async`.
- Auth: bcrypt-hashed passwords; HTTP-only, `secure`, `sameSite=lax` session cookies; two roles only — `admin`, `team`.
- Stored patient identifiers (later plans): Name + DOB only. Not relevant to this plan but do not add a client-contact table.
- Clinical tags are drawn from controlled taxonomies (`taxonomy_terms`), never free text.
- Copy: sentence case, no title case, no exclamation marks in UI system copy.
- Mock-mode-without-keys: the app must boot and be exercisable with no external credentials set.
- Tests: Vitest. Keep the suite green. TDD — failing test first.
- Dev server runs on port 3200 (avoid clashing with other local projects on 3100/3000).

---

### Task 1: Project scaffold, tooling, and Turso client

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.example`, `postcss.config.mjs`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `lib/db.ts`
- Test: `test/db.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `getDb(): Client` — returns a memoised `@libsql/client` `Client`. Uses `file:local.db` when `TURSO_DATABASE_URL` is unset (local/dev), else the configured URL + auth token.
  - `query<T>(sql: string, args?: InArgs): Promise<T[]>` — parameterised read, returns rows typed as `T`.
  - `execute(sql: string, args?: InArgs): Promise<ResultSet>` — parameterised write.

- [ ] **Step 1: Initialise the project and install dependencies**

Run:
```bash
cd "/Users/utkarshrawat/Wild Dash/supplement-selection-db"
npm init -y
npm install next@14 react@18 react-dom@18 @libsql/client bcryptjs jose papaparse
npm install -D typescript @types/react @types/node @types/bcryptjs @types/papaparse vitest @vitejs/plugin-react tailwindcss postcss autoprefixer ts-node
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { experimental: { serverActions: { bodySizeLimit: "5mb" } } };
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

`.env.example`:
```
# Local dev uses file:local.db when these are unset
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
SESSION_SECRET=change-me-in-production-min-32-chars
```

Add scripts to `package.json`:
```json
"scripts": {
  "dev": "next dev -p 3200",
  "build": "next build",
  "start": "next start -p 3200",
  "test": "vitest run",
  "test:watch": "vitest",
  "migrate": "node --loader ts-node/esm scripts/migrate.ts"
}
```
(Note: the `migrate` script is wired in Task 2; leave it here now.)

- [ ] **Step 3: Tailwind + globals + minimal app shell**

Run: `npx tailwindcss init -p` then set `tailwind.config.ts` `content` to `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]`.

`app/globals.css` (design-token baseline — refined in Plan 3):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { --brand: #0F6E56; --brand-tint: #E1F5EE; --ink: #2C2C2A; --muted: #5F5E5A; }
body { color: var(--ink); background: #fafaf8; }
```

`app/layout.tsx`:
```tsx
import "./globals.css";
export const metadata = { title: "Supplement plans" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <main style={{ padding: 24 }}>Supplement Selection Database</main>;
}
```

- [ ] **Step 4: Write `lib/db.ts`**

```ts
import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";

let _db: Client | null = null;

export function getDb(): Client {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL || "file:local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  _db = createClient({ url, authToken });
  return _db;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await getDb().execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  return getDb().execute({ sql, args });
}
```

- [ ] **Step 5: Write the failing test**

`test/db.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execute, query } from "@/lib/db";

describe("db layer", () => {
  beforeAll(async () => {
    await execute("CREATE TABLE IF NOT EXISTS _probe (id INTEGER PRIMARY KEY, name TEXT)");
    await execute("DELETE FROM _probe");
  });
  it("executes parameterised writes and reads", async () => {
    await execute("INSERT INTO _probe (name) VALUES (?)", ["hello"]);
    const rows = await query<{ name: string }>("SELECT name FROM _probe WHERE name = ?", ["hello"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("hello");
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- test/db.test.ts`
Expected: PASS (creates `local.db` in the project root).

- [ ] **Step 7: Commit**

```bash
echo "node_modules/\n.next/\n.env*\n.DS_Store\n*.db" > .gitignore
git add -A
git commit -m "feat: scaffold Next.js app, tooling, and Turso db layer"
```

---

### Task 2: Database schema + migration runner

**Files:**
- Create: `scripts/migrate.ts`, `lib/schema.sql`
- Test: `test/schema.test.ts`

**Interfaces:**
- Consumes: `execute`, `query` from `lib/db.ts`.
- Produces:
  - `runMigrations(): Promise<void>` — executes every statement in `lib/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`).
  - Tables: `users`, `brands`, `products`, `taxonomy_terms`, `product_tags`, `supplier_links`, `product_alternatives`, `clinic_settings`.

- [ ] **Step 1: Write `lib/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','team')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  website TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  package_size TEXT,
  form TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taxonomy_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('allergen','ingredient','concern','diet','caution')),
  label TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  UNIQUE (type, label)
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id),
  tag_type TEXT NOT NULL CHECK (tag_type IN ('ingredient','allergen','concern','diet','caution')),
  PRIMARY KEY (product_id, taxonomy_term_id, tag_type)
);

CREATE TABLE IF NOT EXISTS supplier_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_alternatives (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alternative_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, alternative_product_id)
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  clinic_name TEXT,
  logo_url TEXT,
  address TEXT,
  contact TEXT,
  email_from TEXT
);
```

- [ ] **Step 2: Write `scripts/migrate.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execute } from "../lib/db";

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "lib/schema.sql"), "utf8");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await execute(stmt);
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations().then(() => { console.log("migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Write the failing test**

`test/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";

describe("schema", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates all foundation tables", async () => {
    const rows = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = rows.map((r) => r.name);
    for (const t of ["users","brands","products","taxonomy_terms","product_tags","supplier_links","product_alternatives","clinic_settings"]) {
      expect(names).toContain(t);
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `npm test -- test/schema.test.ts`
Expected: PASS after `runMigrations` exists. (If the alias `@/scripts` fails to resolve, confirm the vitest alias from Task 1 maps `@` to project root.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add db schema and migration runner"
```

---

### Task 3: Password + session utilities

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/session.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: nothing beyond libraries.
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `type SessionPayload = { userId: number; role: "admin" | "team"; name: string }`
  - `signSession(payload: SessionPayload): Promise<string>` — JWT signed with `SESSION_SECRET`, 30-day expiry.
  - `verifySession(token: string): Promise<SessionPayload | null>`

- [ ] **Step 1: Write `lib/auth/password.ts`**

```ts
import bcrypt from "bcryptjs";
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 2: Write `lib/auth/session.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = { userId: number; role: "admin" | "team"; name: string };

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
    return { userId: Number(payload.userId), role: payload.role as "admin" | "team", name: String(payload.name) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Write the failing test**

`test/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession, verifySession } from "@/lib/auth/session";

describe("password", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("session", () => {
  it("round-trips a payload", async () => {
    const token = await signSession({ userId: 7, role: "admin", name: "Lorna" });
    const decoded = await verifySession(token);
    expect(decoded).toEqual({ userId: 7, role: "admin", name: "Lorna" });
  });
  it("rejects a tampered token", async () => {
    expect(await verifySession("not.a.jwt")).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add password hashing and session utilities"
```

---

### Task 4: Login, logout, current-user, and route protection

**Files:**
- Create: `lib/auth/current-user.ts`, `lib/users.ts`, `app/login/page.tsx`, `app/api/login/route.ts`, `app/api/logout/route.ts`, `middleware.ts`, `scripts/seed-admin.ts`
- Test: `test/users.test.ts`

**Interfaces:**
- Consumes: `query`, `execute` (db); password + session utils; `SessionPayload`.
- Produces:
  - `createUser(input: { email: string; password: string; role: "admin"|"team"; name: string }): Promise<number>` — returns new user id.
  - `findUserByEmail(email: string): Promise<{ id: number; email: string; password_hash: string; role: "admin"|"team"; name: string } | null>`
  - `getCurrentUser(): Promise<SessionPayload | null>` — reads the `sess` cookie (server components/actions).
  - `requireUser()` / `requireAdmin()` — throw `redirect("/login")` if unauthorised.
  - Cookie name: `sess` (HTTP-only, secure, sameSite lax, 30d).

- [ ] **Step 1: Write `lib/users.ts`**

```ts
import { query, execute } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export type UserRow = { id: number; email: string; password_hash: string; role: "admin"|"team"; name: string };

export async function createUser(input: { email: string; password: string; role: "admin"|"team"; name: string }): Promise<number> {
  const hash = await hashPassword(input.password);
  const rs = await execute(
    "INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)",
    [input.email.toLowerCase().trim(), hash, input.role, input.name.trim()]
  );
  return Number(rs.lastInsertRowid);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  return rows[0] ?? null;
}

export async function listUsers(): Promise<Omit<UserRow, "password_hash">[]> {
  return query("SELECT id, email, role, name FROM users ORDER BY name");
}

export async function deleteUser(id: number): Promise<void> {
  await execute("DELETE FROM users WHERE id = ?", [id]);
}
```

- [ ] **Step 2: Write the failing test**

`test/users.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser, findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";

describe("users", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates a user with a hashed password and finds by email", async () => {
    const email = `t${Date.now()}@clinic.test`;
    await createUser({ email, password: "pw123456", role: "team", name: "Test" });
    const u = await findUserByEmail(email);
    expect(u).not.toBeNull();
    expect(u!.role).toBe("team");
    expect(u!.password_hash).not.toBe("pw123456");
    expect(await verifyPassword("pw123456", u!.password_hash)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npm test -- test/users.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `lib/auth/current-user.ts`**

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, type SessionPayload } from "@/lib/auth/session";

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = cookies().get("sess")?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(): Promise<SessionPayload> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
```

- [ ] **Step 5: Write the login route `app/api/login/route.ts`**

```ts
import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const user = await findUserByEmail(String(email ?? ""));
  if (!user || !(await verifyPassword(String(password ?? ""), user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = await signSession({ userId: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
```

- [ ] **Step 6: Write `app/api/logout/route.ts`**

```ts
import { NextResponse } from "next/server";
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sess", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 7: Write `app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (res.ok) router.push("/catalog");
    else setError((await res.json()).error ?? "Login failed");
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontWeight: 500 }}>Sign in</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input placeholder="name@clinic.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p style={{ color: "#A32D2D", fontSize: 13 }}>{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Write `middleware.ts` (guards everything except `/login` and `/api/login`)**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";

const PUBLIC = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next")) return NextResponse.next();
  const token = req.cookies.get("sess")?.value;
  if (!token || !(await verifySession(token))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 9: Write `scripts/seed-admin.ts`**

```ts
import { runMigrations } from "./migrate";
import { createUser, findUserByEmail } from "../lib/users";

async function main() {
  await runMigrations();
  const email = process.env.SEED_ADMIN_EMAIL || "admin@clinic.test";
  const password = process.env.SEED_ADMIN_PASSWORD || "wild-admin-2026";
  if (await findUserByEmail(email)) { console.log("admin already exists"); return; }
  await createUser({ email, password, role: "admin", name: "Clinic Admin" });
  console.log(`seeded admin ${email}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 10: Manually verify the login flow**

Run:
```bash
node --loader ts-node/esm scripts/seed-admin.ts
npm run dev
```
Then in the browser (port 3200): visit `/catalog` → redirected to `/login` → sign in with `admin@clinic.test` / `wild-admin-2026` → lands on `/catalog` (404 until Task 8, which is expected). Confirm the `sess` cookie is set and HTTP-only in devtools.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: add login/logout, route protection, and admin seeding"
```

---

### Task 5: User management (admin)

**Files:**
- Create: `app/admin/users/page.tsx`, `app/admin/users/actions.ts`
- Test: `test/users-admin.test.ts`

**Interfaces:**
- Consumes: `listUsers`, `createUser`, `deleteUser` (`lib/users.ts`), `requireAdmin`.
- Produces: server actions `addUserAction(formData)` and `removeUserAction(id)`; admin page listing users with add/remove.

- [ ] **Step 1: Write the failing test (data layer already exists; test the guard-independent helpers)**

`test/users-admin.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser, listUsers, deleteUser } from "@/lib/users";

describe("user admin helpers", () => {
  beforeAll(async () => { await runMigrations(); });
  it("lists then removes a user", async () => {
    const id = await createUser({ email: `del${Date.now()}@c.test`, password: "pw123456", role: "team", name: "Del" });
    const before = await listUsers();
    expect(before.some((u) => u.id === id)).toBe(true);
    await deleteUser(id);
    const after = await listUsers();
    expect(after.some((u) => u.id === id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- test/users-admin.test.ts`
Expected: PASS.

- [ ] **Step 3: Write `app/admin/users/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createUser, deleteUser } from "@/lib/users";

export async function addUserAction(formData: FormData) {
  await requireAdmin();
  await createUser({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    role: (String(formData.get("role")) === "admin" ? "admin" : "team"),
    name: String(formData.get("name")),
  });
  revalidatePath("/admin/users");
}

export async function removeUserAction(formData: FormData) {
  await requireAdmin();
  await deleteUser(Number(formData.get("id")));
  revalidatePath("/admin/users");
}
```

- [ ] **Step 4: Write `app/admin/users/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/users";
import { addUserAction, removeUserAction } from "./actions";

export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Team members</h1>
      <ul>
        {users.map((u) => (
          <li key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span>{u.name} · {u.email} · {u.role}</span>
            <form action={removeUserAction}><input type="hidden" name="id" value={u.id} /><button>Remove</button></form>
          </li>
        ))}
      </ul>
      <form action={addUserAction} style={{ display: "grid", gap: 8, marginTop: 16 }}>
        <input name="name" placeholder="Full name" required />
        <input name="email" placeholder="name@clinic.co.uk" required />
        <input name="password" type="password" placeholder="Temporary password" required />
        <select name="role" defaultValue="team"><option value="team">Team</option><option value="admin">Admin</option></select>
        <button type="submit">Add member</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add admin user management"
```

---

### Task 6: Taxonomy terms (controlled vocabularies)

**Files:**
- Create: `lib/taxonomies.ts`, `app/admin/taxonomies/page.tsx`, `app/admin/taxonomies/actions.ts`
- Test: `test/taxonomies.test.ts`

**Interfaces:**
- Consumes: `query`, `execute`; `requireAdmin`.
- Produces:
  - `type TermType = "allergen"|"ingredient"|"concern"|"diet"|"caution"`
  - `addTerm(type: TermType, label: string, createdBy?: number): Promise<number>` — idempotent on `(type,label)`; returns existing or new id.
  - `listTerms(type?: TermType): Promise<{ id: number; type: TermType; label: string }[]>`
  - `deleteTerm(id: number): Promise<void>`

- [ ] **Step 1: Write `lib/taxonomies.ts`**

```ts
import { query, execute } from "@/lib/db";
export type TermType = "allergen"|"ingredient"|"concern"|"diet"|"caution";
export type Term = { id: number; type: TermType; label: string };

export async function addTerm(type: TermType, label: string, createdBy?: number): Promise<number> {
  const clean = label.trim();
  await execute(
    "INSERT OR IGNORE INTO taxonomy_terms (type, label, created_by) VALUES (?, ?, ?)",
    [type, clean, createdBy ?? null]
  );
  const rows = await query<{ id: number }>("SELECT id FROM taxonomy_terms WHERE type = ? AND label = ?", [type, clean]);
  return rows[0].id;
}

export async function listTerms(type?: TermType): Promise<Term[]> {
  if (type) return query<Term>("SELECT id, type, label FROM taxonomy_terms WHERE type = ? ORDER BY label", [type]);
  return query<Term>("SELECT id, type, label FROM taxonomy_terms ORDER BY type, label");
}

export async function deleteTerm(id: number): Promise<void> {
  await execute("DELETE FROM taxonomy_terms WHERE id = ?", [id]);
}
```

- [ ] **Step 2: Write the failing test**

`test/taxonomies.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm, listTerms } from "@/lib/taxonomies";

describe("taxonomies", () => {
  beforeAll(async () => { await runMigrations(); });
  it("adds a term idempotently and lists by type", async () => {
    const id1 = await addTerm("allergen", "mushroom");
    const id2 = await addTerm("allergen", "  mushroom  ");
    expect(id1).toBe(id2);
    const allergens = await listTerms("allergen");
    expect(allergens.some((t) => t.label === "mushroom")).toBe(true);
    expect(allergens.every((t) => t.type === "allergen")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test**

Run: `npm test -- test/taxonomies.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `app/admin/taxonomies/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { addTerm, deleteTerm, type TermType } from "@/lib/taxonomies";

export async function addTermAction(formData: FormData) {
  const u = await requireAdmin();
  await addTerm(String(formData.get("type")) as TermType, String(formData.get("label")), u.userId);
  revalidatePath("/admin/taxonomies");
}
export async function deleteTermAction(formData: FormData) {
  await requireAdmin();
  await deleteTerm(Number(formData.get("id")));
  revalidatePath("/admin/taxonomies");
}
```

- [ ] **Step 5: Write `app/admin/taxonomies/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { addTermAction, deleteTermAction } from "./actions";

const TYPES: TermType[] = ["allergen","ingredient","concern","diet","caution"];

export default async function TaxonomiesPage() {
  await requireAdmin();
  const terms = await listTerms();
  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Taxonomies</h1>
      {TYPES.map((type) => (
        <section key={type} style={{ marginTop: 20 }}>
          <h2 style={{ fontWeight: 500, fontSize: 16, textTransform: "capitalize" }}>{type}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {terms.filter((t) => t.type === type).map((t) => (
              <form key={t.id} action={deleteTermAction}>
                <input type="hidden" name="id" value={t.id} />
                <button style={{ fontSize: 12 }}>{t.label} ✕</button>
              </form>
            ))}
          </div>
          <form action={addTermAction} style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input type="hidden" name="type" value={type} />
            <input name="label" placeholder={`Add ${type}`} required />
            <button type="submit">Add</button>
          </form>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add controlled taxonomy management"
```

---

### Task 7: Brands

**Files:**
- Create: `lib/brands.ts`, `app/catalog/brands/page.tsx`, `app/catalog/brands/actions.ts`
- Test: `test/brands.test.ts`

**Interfaces:**
- Consumes: `query`, `execute`; `requireUser`.
- Produces:
  - `createBrand(input: { name: string; website?: string; logoUrl?: string }): Promise<number>`
  - `listBrands(): Promise<{ id: number; name: string; website: string|null; logo_url: string|null }[]>`
  - `getBrand(id: number): Promise<{ id: number; name: string } | null>`

- [ ] **Step 1: Write `lib/brands.ts`**

```ts
import { query, execute } from "@/lib/db";
export type Brand = { id: number; name: string; website: string|null; logo_url: string|null };

export async function createBrand(input: { name: string; website?: string; logoUrl?: string }): Promise<number> {
  const rs = await execute(
    "INSERT INTO brands (name, website, logo_url) VALUES (?, ?, ?)",
    [input.name.trim(), input.website?.trim() || null, input.logoUrl?.trim() || null]
  );
  return Number(rs.lastInsertRowid);
}
export async function listBrands(): Promise<Brand[]> {
  return query<Brand>("SELECT id, name, website, logo_url FROM brands ORDER BY name");
}
export async function getBrand(id: number): Promise<{ id: number; name: string } | null> {
  const rows = await query<{ id: number; name: string }>("SELECT id, name FROM brands WHERE id = ?", [id]);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Write the failing test**

`test/brands.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand, listBrands } from "@/lib/brands";

describe("brands", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates and lists brands alphabetically", async () => {
    await createBrand({ name: `Zebra ${Date.now()}` });
    await createBrand({ name: `Acme ${Date.now()}` });
    const all = await listBrands();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const names = all.map((b) => b.name);
    expect([...names]).toEqual([...names].sort());
  });
});
```

- [ ] **Step 3: Run test**

Run: `npm test -- test/brands.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `app/catalog/brands/actions.ts` and `page.tsx`**

`actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { createBrand } from "@/lib/brands";

export async function addBrandAction(formData: FormData) {
  await requireUser();
  await createBrand({ name: String(formData.get("name")), website: String(formData.get("website") || "") });
  revalidatePath("/catalog/brands");
}
```

`page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { addBrandAction } from "./actions";

export default async function BrandsPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Brands</h1>
      <ul>{brands.map((b) => <li key={b.id}>{b.name}</li>)}</ul>
      <form action={addBrandAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <input name="name" placeholder="Brand name" required />
        <input name="website" placeholder="https://…" />
        <button type="submit">Add brand</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add brand management"
```

---

### Task 8: Products — data layer (with tags, supplier links, alternatives) + search

**Files:**
- Create: `lib/products.ts`
- Test: `test/products.test.ts`

**Interfaces:**
- Consumes: `query`, `execute`; taxonomy `TermType`.
- Produces:
  - `type ProductInput = { brandId: number; name: string; packageSize?: string; form?: string }`
  - `createProduct(input: ProductInput): Promise<number>`
  - `updateProduct(id: number, input: ProductInput): Promise<void>`
  - `archiveProduct(id: number): Promise<void>`
  - `setProductTags(productId: number, tags: { termId: number; tagType: TermType }[]): Promise<void>` — replaces all tags.
  - `addSupplierLink(productId: number, label: string, url: string): Promise<number>`
  - `removeSupplierLink(linkId: number): Promise<void>`
  - `linkAlternative(productId: number, altId: number): Promise<void>` — writes both directions (symmetric).
  - `getProduct(id: number): Promise<ProductDetail | null>` where `ProductDetail = { id; brand_id; brand_name; name; package_size; form; status; tags: {termId; label; tagType}[]; suppliers: {id; label; url}[]; alternatives: {id; name}[] }`
  - `searchProducts(term: string): Promise<{ id: number; name: string; brand_name: string; form: string|null; package_size: string|null }[]>` — matches product OR brand name, active only, across all brands.

- [ ] **Step 1: Write `lib/products.ts`**

```ts
import { query, execute } from "@/lib/db";
import type { TermType } from "@/lib/taxonomies";

export type ProductInput = { brandId: number; name: string; packageSize?: string; form?: string };
export type ProductDetail = {
  id: number; brand_id: number; brand_name: string; name: string;
  package_size: string|null; form: string|null; status: string;
  tags: { termId: number; label: string; tagType: TermType }[];
  suppliers: { id: number; label: string; url: string }[];
  alternatives: { id: number; name: string }[];
};

export async function createProduct(input: ProductInput): Promise<number> {
  const rs = await execute(
    "INSERT INTO products (brand_id, name, package_size, form) VALUES (?, ?, ?, ?)",
    [input.brandId, input.name.trim(), input.packageSize?.trim() || null, input.form?.trim() || null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await execute(
    "UPDATE products SET brand_id = ?, name = ?, package_size = ?, form = ? WHERE id = ?",
    [input.brandId, input.name.trim(), input.packageSize?.trim() || null, input.form?.trim() || null, id]
  );
}

export async function archiveProduct(id: number): Promise<void> {
  await execute("UPDATE products SET status = 'archived' WHERE id = ?", [id]);
}

export async function setProductTags(productId: number, tags: { termId: number; tagType: TermType }[]): Promise<void> {
  await execute("DELETE FROM product_tags WHERE product_id = ?", [productId]);
  for (const t of tags) {
    await execute(
      "INSERT OR IGNORE INTO product_tags (product_id, taxonomy_term_id, tag_type) VALUES (?, ?, ?)",
      [productId, t.termId, t.tagType]
    );
  }
}

export async function addSupplierLink(productId: number, label: string, url: string): Promise<number> {
  const rs = await execute(
    "INSERT INTO supplier_links (product_id, label, url) VALUES (?, ?, ?)",
    [productId, label.trim(), url.trim()]
  );
  return Number(rs.lastInsertRowid);
}

export async function removeSupplierLink(linkId: number): Promise<void> {
  await execute("DELETE FROM supplier_links WHERE id = ?", [linkId]);
}

export async function linkAlternative(productId: number, altId: number): Promise<void> {
  await execute("INSERT OR IGNORE INTO product_alternatives (product_id, alternative_product_id) VALUES (?, ?)", [productId, altId]);
  await execute("INSERT OR IGNORE INTO product_alternatives (product_id, alternative_product_id) VALUES (?, ?)", [altId, productId]);
}

export async function getProduct(id: number): Promise<ProductDetail | null> {
  const base = await query<Omit<ProductDetail,"tags"|"suppliers"|"alternatives">>(
    `SELECT p.id, p.brand_id, b.name AS brand_name, p.name, p.package_size, p.form, p.status
     FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?`, [id]
  );
  if (!base[0]) return null;
  const tags = await query<{ termId: number; label: string; tagType: TermType }>(
    `SELECT t.id AS termId, t.label AS label, pt.tag_type AS tagType
     FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id WHERE pt.product_id = ?`, [id]
  );
  const suppliers = await query<{ id: number; label: string; url: string }>(
    "SELECT id, label, url FROM supplier_links WHERE product_id = ?", [id]
  );
  const alternatives = await query<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM product_alternatives a JOIN products p ON p.id = a.alternative_product_id WHERE a.product_id = ?`, [id]
  );
  return { ...base[0], tags, suppliers, alternatives };
}

export async function searchProducts(term: string): Promise<{ id: number; name: string; brand_name: string; form: string|null; package_size: string|null }[]> {
  const like = `%${term.trim()}%`;
  return query(
    `SELECT p.id, p.name, b.name AS brand_name, p.form, p.package_size
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.status = 'active' AND (p.name LIKE ? OR b.name LIKE ?)
     ORDER BY b.name, p.name`, [like, like]
  );
}
```

- [ ] **Step 2: Write the failing test**

`test/products.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { addTerm } from "@/lib/taxonomies";
import * as P from "@/lib/products";

describe("products", () => {
  let brandId = 0;
  beforeAll(async () => { await runMigrations(); brandId = await createBrand({ name: `Wild ${Date.now()}` }); });

  it("creates a product with tags, suppliers, and a symmetric alternative", async () => {
    const capId = await P.createProduct({ brandId, name: "Food-Grown Magnesium", packageSize: "60 caps", form: "capsule" });
    const oilId = await P.createProduct({ brandId, name: "Magnesium Liquid", packageSize: "100ml", form: "liquid" });

    const mushroom = await addTerm("allergen", "mushroom");
    const sleep = await addTerm("concern", "sleep");
    await P.setProductTags(capId, [{ termId: mushroom, tagType: "allergen" }, { termId: sleep, tagType: "concern" }]);

    await P.addSupplierLink(capId, "Wild Nutrition", "https://wildnutrition.com/x");
    await P.addSupplierLink(capId, "Natural Dispensary", "https://naturaldispensary.co.uk/x");
    await P.linkAlternative(capId, oilId);

    const detail = await P.getProduct(capId);
    expect(detail!.name).toBe("Food-Grown Magnesium");
    expect(detail!.tags.map((t) => t.label).sort()).toEqual(["mushroom","sleep"]);
    expect(detail!.suppliers).toHaveLength(2);
    expect(detail!.alternatives.map((a) => a.id)).toContain(oilId);

    const reverse = await P.getProduct(oilId);
    expect(reverse!.alternatives.map((a) => a.id)).toContain(capId);
  });

  it("searches by product or brand name, active only", async () => {
    const hits = await P.searchProducts("Magnesium");
    expect(hits.some((h) => h.name.includes("Magnesium"))).toBe(true);
  });

  it("setProductTags replaces rather than appends", async () => {
    const id = await P.createProduct({ brandId, name: "Replace test", form: "capsule" });
    const a = await addTerm("ingredient", "iron");
    const b = await addTerm("ingredient", "zinc");
    await P.setProductTags(id, [{ termId: a, tagType: "ingredient" }]);
    await P.setProductTags(id, [{ termId: b, tagType: "ingredient" }]);
    const detail = await P.getProduct(id);
    expect(detail!.tags.map((t) => t.label)).toEqual(["zinc"]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- test/products.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add product data layer with tags, suppliers, alternatives, search"
```

---

### Task 9: Catalog + product editor screens

**Files:**
- Create: `app/catalog/page.tsx`, `app/catalog/products/[id]/page.tsx`, `app/catalog/products/actions.ts`, `app/catalog/new/page.tsx`, `components/ProductSearch.tsx`
- Test: `test/catalog-actions.test.ts`

**Interfaces:**
- Consumes: all of `lib/products.ts`, `lib/brands.ts`, `lib/taxonomies.ts`; `requireUser`.
- Produces: server actions `saveProductAction`, `saveTagsAction`, `addSupplierAction`, `removeSupplierAction`, `addAlternativeAction`, `archiveProductAction`; a searchable catalog list; a product editor page.

- [ ] **Step 1: Write the failing test for the action layer**

`test/catalog-actions.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { addTerm, listTerms } from "@/lib/taxonomies";
import * as P from "@/lib/products";

// The actions are thin wrappers around lib/products (verified in Task 8).
// Here we assert the editor's data contract: a product editor must be able to
// load a product, its brand list, and grouped term options in one place.
describe("catalog editor data contract", () => {
  beforeAll(async () => { await runMigrations(); });
  it("provides everything the editor needs", async () => {
    const brandId = await createBrand({ name: `Bare ${Date.now()}` });
    const id = await P.createProduct({ brandId, name: "Omega-3 Vegan", form: "capsule" });
    await addTerm("diet", "vegan");
    const detail = await P.getProduct(id);
    const diets = await listTerms("diet");
    expect(detail).not.toBeNull();
    expect(diets.some((d) => d.label === "vegan")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- test/catalog-actions.test.ts`
Expected: PASS.

- [ ] **Step 3: Write `app/catalog/products/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import * as P from "@/lib/products";
import type { TermType } from "@/lib/taxonomies";

export async function saveProductAction(formData: FormData) {
  await requireUser();
  const idRaw = formData.get("id");
  const input = {
    brandId: Number(formData.get("brandId")),
    name: String(formData.get("name")),
    packageSize: String(formData.get("packageSize") || ""),
    form: String(formData.get("form") || ""),
  };
  if (idRaw) { await P.updateProduct(Number(idRaw), input); revalidatePath(`/catalog/products/${idRaw}`); }
  else { const id = await P.createProduct(input); redirect(`/catalog/products/${id}`); }
}

export async function saveTagsAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  const tags: { termId: number; tagType: TermType }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("tag:")) {
      const tagType = key.slice(4) as TermType;
      for (const id of String(value).split(",").filter(Boolean)) tags.push({ termId: Number(id), tagType });
    }
  }
  await P.setProductTags(productId, tags);
  revalidatePath(`/catalog/products/${productId}`);
}

export async function addSupplierAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  await P.addSupplierLink(productId, String(formData.get("label")), String(formData.get("url")));
  revalidatePath(`/catalog/products/${productId}`);
}

export async function removeSupplierAction(formData: FormData) {
  await requireUser();
  await P.removeSupplierLink(Number(formData.get("linkId")));
  revalidatePath(`/catalog/products/${formData.get("productId")}`);
}

export async function addAlternativeAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  await P.linkAlternative(productId, Number(formData.get("altId")));
  revalidatePath(`/catalog/products/${productId}`);
}

export async function archiveProductAction(formData: FormData) {
  await requireUser();
  await P.archiveProduct(Number(formData.get("id")));
  redirect("/catalog");
}
```

- [ ] **Step 4: Write `components/ProductSearch.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Hit = { id: number; name: string; brand_name: string; form: string|null; package_size: string|null };

export default function ProductSearch({ initial }: { initial: Hit[] }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>(initial);
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(term)}`);
      setHits(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [term]);
  return (
    <div>
      <input placeholder="Search all products — vitamin D, magnesium…" value={term} onChange={(e) => setTerm(e.target.value)} style={{ width: "100%" }} />
      <ul style={{ marginTop: 12 }}>
        {hits.map((h) => (
          <li key={h.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd" }}>
            <Link href={`/catalog/products/${h.id}`}>{h.name}</Link>
            <span style={{ color: "#5F5E5A", fontSize: 13 }}> · {h.brand_name}{h.form ? ` · ${h.form}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Write the search API `app/api/products/search/route.ts`**

```ts
import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/products";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  return NextResponse.json(await searchProducts(q));
}
```

- [ ] **Step 6: Write `app/catalog/page.tsx`**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { searchProducts } from "@/lib/products";
import ProductSearch from "@/components/ProductSearch";

export default async function CatalogPage() {
  await requireUser();
  const initial = await searchProducts("");
  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontWeight: 500 }}>Catalog</h1>
        <Link href="/catalog/new">Add product</Link>
      </div>
      <ProductSearch initial={initial} />
    </main>
  );
}
```

- [ ] **Step 7: Write `app/catalog/new/page.tsx` and `app/catalog/products/[id]/page.tsx`**

`app/catalog/new/page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { saveProductAction } from "@/app/catalog/products/actions";

export default async function NewProductPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>New product</h1>
      <form action={saveProductAction} style={{ display: "grid", gap: 8 }}>
        <select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input name="name" placeholder="Product name" required />
        <input name="packageSize" placeholder="e.g. 60 capsules" />
        <input name="form" placeholder="e.g. capsule / liquid / powder" />
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
```

`app/catalog/products/[id]/page.tsx` (editor — product fields, tag pickers per type, suppliers, alternatives):
```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProduct, searchProducts } from "@/lib/products";
import { listBrands } from "@/lib/brands";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { saveProductAction, saveTagsAction, addSupplierAction, removeSupplierAction, addAlternativeAction } from "@/app/catalog/products/actions";

const TAG_TYPES: TermType[] = ["ingredient","allergen","concern","diet","caution"];

export default async function ProductEditor({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const product = await getProduct(id);
  if (!product) notFound();
  const brands = await listBrands();
  const allTerms = await listTerms();
  const others = (await searchProducts("")).filter((p) => p.id !== id);

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", display: "grid", gap: 24 }}>
      <section>
        <h1 style={{ fontWeight: 500 }}>{product.name}</h1>
        <form action={saveProductAction} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="id" value={product.id} />
          <select name="brandId" defaultValue={product.brand_id}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input name="name" defaultValue={product.name} />
          <input name="packageSize" defaultValue={product.package_size ?? ""} placeholder="Package size" />
          <input name="form" defaultValue={product.form ?? ""} placeholder="Form" />
          <button type="submit">Save details</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Tags</h2>
        <form action={saveTagsAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="productId" value={product.id} />
          {TAG_TYPES.map((type) => {
            const selected = product.tags.filter((t) => t.tagType === type).map((t) => t.termId).join(",");
            return (
              <label key={type} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, textTransform: "capitalize" }}>{type}</span>
                <select name={`tag:${type}`} multiple defaultValue={selected.split(",").filter(Boolean)}>
                  {allTerms.filter((t) => t.type === type).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            );
          })}
          <button type="submit">Save tags</button>
        </form>
        <p style={{ fontSize: 12, color: "#5F5E5A" }}>Missing a term? Add it in admin → taxonomies.</p>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Supplier links</h2>
        <ul>{product.suppliers.map((s) => (
          <li key={s.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <a href={s.url}>{s.label}</a>
            <form action={removeSupplierAction}><input type="hidden" name="linkId" value={s.id} /><input type="hidden" name="productId" value={product.id} /><button>Remove</button></form>
          </li>
        ))}</ul>
        <form action={addSupplierAction} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="productId" value={product.id} />
          <input name="label" placeholder="Supplier" required />
          <input name="url" placeholder="https://…" required />
          <button type="submit">Add</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Alternative formats</h2>
        <ul>{product.alternatives.map((a) => <li key={a.id}>{a.name}</li>)}</ul>
        <form action={addAlternativeAction} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="productId" value={product.id} />
          <select name="altId">{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button type="submit">Link alternative</button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Manually verify in the browser**

Run: `npm run dev`, sign in, go to `/catalog`, add a brand (`/catalog/brands`), add a product, open it, set tags/suppliers/alternatives, and search. Confirm each save persists after refresh.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add catalog, product editor, and live search screens"
```

---

### Task 10: CSV import for the partial catalog

**Files:**
- Create: `lib/import.ts`, `app/catalog/import/page.tsx`, `app/catalog/import/actions.ts`
- Test: `test/import.test.ts`

**Interfaces:**
- Consumes: `createBrand`, `listBrands`, `createProduct`.
- Produces:
  - `type ImportRow = { brand: string; name: string; package_size?: string; form?: string }`
  - `parseCatalogCsv(csv: string): ImportRow[]` — parses headers `brand,name,package_size,form` (case-insensitive), skips blank rows.
  - `importRows(rows: ImportRow[]): Promise<{ created: number; brandsCreated: number }>` — finds-or-creates each brand by name, then inserts products. Idempotency is not required (re-import creates duplicates); the UI warns about this.

- [ ] **Step 1: Write `lib/import.ts`**

```ts
import Papa from "papaparse";
import { createBrand, listBrands } from "@/lib/brands";
import { createProduct } from "@/lib/products";

export type ImportRow = { brand: string; name: string; package_size?: string; form?: string };

export function parseCatalogCsv(csv: string): ImportRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const rows: ImportRow[] = [];
  for (const r of parsed.data) {
    const brand = (r["brand"] ?? "").trim();
    const name = (r["name"] ?? "").trim();
    if (!brand || !name) continue;
    rows.push({ brand, name, package_size: (r["package_size"] ?? "").trim() || undefined, form: (r["form"] ?? "").trim() || undefined });
  }
  return rows;
}

export async function importRows(rows: ImportRow[]): Promise<{ created: number; brandsCreated: number }> {
  const existing = await listBrands();
  const byName = new Map(existing.map((b) => [b.name.toLowerCase(), b.id]));
  let created = 0, brandsCreated = 0;
  for (const row of rows) {
    let brandId = byName.get(row.brand.toLowerCase());
    if (!brandId) { brandId = await createBrand({ name: row.brand }); byName.set(row.brand.toLowerCase(), brandId); brandsCreated++; }
    await createProduct({ brandId, name: row.name, packageSize: row.package_size, form: row.form });
    created++;
  }
  return { created, brandsCreated };
}
```

- [ ] **Step 2: Write the failing test**

`test/import.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { parseCatalogCsv, importRows } from "@/lib/import";
import { searchProducts } from "@/lib/products";

describe("csv import", () => {
  beforeAll(async () => { await runMigrations(); });
  it("parses headers case-insensitively and skips blanks", () => {
    const csv = "Brand,Name,Package_Size,Form\nWild Nutrition,Food-Grown Zinc,30 caps,capsule\n,,,\nBare Biology,Life & Soul,60 caps,capsule\n";
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ brand: "Wild Nutrition", name: "Food-Grown Zinc", package_size: "30 caps", form: "capsule" });
  });
  it("imports rows, creating brands as needed", async () => {
    const stamp = Date.now();
    const rows = parseCatalogCsv(`brand,name,form\nImportCo ${stamp},Widget A,capsule\nImportCo ${stamp},Widget B,liquid\n`);
    const result = await importRows(rows);
    expect(result.created).toBe(2);
    expect(result.brandsCreated).toBe(1);
    const hits = await searchProducts(`Widget`);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- test/import.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `app/catalog/import/actions.ts` and `page.tsx`**

`actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { parseCatalogCsv, importRows } from "@/lib/import";

export async function importCsvAction(formData: FormData): Promise<void> {
  await requireUser();
  const csv = String(formData.get("csv") || "");
  const rows = parseCatalogCsv(csv);
  await importRows(rows);
  revalidatePath("/catalog");
}
```

`page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { importCsvAction } from "./actions";

export default async function ImportPage() {
  await requireUser();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Import products</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>Paste CSV with columns: brand, name, package_size, form. Ingredients and allergens are added per product afterwards. Re-importing creates duplicates.</p>
      <form action={importCsvAction} style={{ display: "grid", gap: 8 }}>
        <textarea name="csv" rows={12} placeholder="brand,name,package_size,form" required />
        <button type="submit">Import</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Full-suite check + commit**

Run: `npm test`
Expected: all tests PASS.

```bash
git add -A && git commit -m "feat: add CSV catalog import"
```

---

## Self-Review

**1. Spec coverage (Plan 1 slice):**
- Multi-user auth + roles → Tasks 3, 4. ✓
- User management → Task 5. ✓
- Controlled taxonomies → Task 6. ✓
- Brands (umbrella) → Task 7. ✓
- Products + tags + multiple supplier links + alternatives → Tasks 8, 9. ✓
- Cross-brand product search → Task 8 (`searchProducts`), Task 9 (UI). ✓
- Partial-list import → Task 10. ✓
- Data model tables from spec §4 (foundation subset) → Task 2. ✓
- Deferred to Plan 2/3 (correct): patients, plan builder, dosing, flagging, PDF, email, snapshots, audit, recommendation engine, URL-enrichment assist, clinic settings UI, design polish pass. `clinic_settings` table is created here (Task 2) but its editor screen lands in Plan 2.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" — every step carries real code and exact commands. ✓

**3. Type consistency:** `TermType` defined in Task 6 and reused verbatim in Tasks 8–10. `ProductInput`/`ProductDetail` defined in Task 8 and consumed unchanged in Task 9. `SessionPayload` defined in Task 3, consumed in Task 4. Cookie name `sess` consistent across Tasks 4 and 8's `middleware.ts`. ✓

**Note for executor:** Tasks 1–2 need `ts-node` for the CLI scripts (`scripts/migrate.ts`, `scripts/seed-admin.ts`). If `node --loader ts-node/esm` is unavailable, install it (`npm i -D ts-node`) or run the scripts through `tsx`. Tests themselves run under Vitest and do not need ts-node.
