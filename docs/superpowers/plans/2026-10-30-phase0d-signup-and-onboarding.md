# Phase 0d — Self-Service Signup + Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A visitor can sign up, which provisions their clinic (its own database, seeded, with a trial), signs them in, and drops them into a short onboarding wizard — with a billing/checkout path when the trial ends. Works in dev with local file databases; uses Turso in production when the token is present.

**Architecture:** A `createDb` resolver returns the real Turso client when `TURSO_PLATFORM_TOKEN` is set, else a local-file creator (so dev signup works with no token). A slug helper turns a clinic name into a unique tenant id. A `signupClinic` server action provisions the tenant (reusing `provisionTenant`), signs the session, and redirects to onboarding. A minimal onboarding wizard links the key first steps. The billing wall gains a Checkout button (Stripe test mode) for converting the trial.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `stripe`, `vitest`.

## Global Constraints

- Dev signup must work with **no external token** (local file DB fallback). Production uses Turso when `TURSO_PLATFORM_TOKEN` + `TURSO_ORG` are set.
- Tenant slugs: lowercase, `[a-z0-9-]`, 3–40 chars, globally unique in the control-plane (Turso DB-name rules).
- The signup page and onboarding are **public** only where they must be: `/signup` is public; onboarding is behind auth.
- Reuse `provisionTenant` (0b) and `signSession`/session cookie conventions (0a). Keep `npm test` green (currently 176).

---

### Task 1: Slug helper + createDb resolver + signup orchestration

**Files:**
- Create: `lib/tenancy/slug.ts`
- Create: `lib/tenancy/create-db.ts`
- Create: `lib/tenancy/signup.ts`
- Test: `test/signup.test.ts`

**Interfaces:**
- Produces: `slugify(name: string): string` — sanitize to `[a-z0-9-]`, collapse hyphens, trim, min length padding.
- Produces: `uniqueTenantSlug(name: string): Promise<string>` — `slugify` + a numeric suffix until free in control `tenants`.
- Produces: `resolveCreateDb(): (name: string) => Promise<{ url: string; authToken: string }>` — Turso client if configured, else local file.
- Produces: `signupClinic(input: { clinicName: string; ownerName: string; email: string; password: string }, deps?: { createDb?: ... }): Promise<{ tenantId: string; tenantUserId: number; alreadyRegistered?: boolean }>` — provisions + returns identity for the caller to sign in. Throws `SignupError` with `code: "email_taken"` if the email already exists in the control-plane.
- Consumes: `provisionTenant` (0b), `findControlUserByEmail`, `listTenants` (control-users), `createTursoDatabase` (0b).

- [ ] **Step 1: Write the failing test**

```ts
// test/signup.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb, query } from "@/lib/db";
import { slugify, uniqueTenantSlug } from "@/lib/tenancy/slug";
import { signupClinic, SignupError } from "@/lib/tenancy/signup";
import { resolveLogin } from "@/lib/auth/login";

async function resetControl() {
  const db = getControlDb();
  for (const t of ["subscriptions", "memberships", "users", "tenants", "provisioning_jobs"]) await db.execute(`DROP TABLE IF EXISTS ${t}`);
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

const localCreateDb = (name: string) => Promise.resolve({ url: `file:test-su-${name}.db`, authToken: "" });

beforeEach(async () => {
  rmSync(join(process.cwd(), "test-su-green-valley.db"), { force: true });
  rmSync(join(process.cwd(), "test-su-green-valley-2.db"), { force: true });
  await resetControl();
});

describe("slugify", () => {
  it("sanitizes a clinic name", () => {
    expect(slugify("Green Valley Nutrition!")).toBe("green-valley-nutrition");
    expect(slugify("A")).toMatch(/^a[a-z0-9-]*$/); // padded to >=3
  });
});

describe("uniqueTenantSlug", () => {
  it("appends a suffix when taken", async () => {
    const { upsertTenant } = await import("@/lib/control-users");
    await upsertTenant({ id: "green-valley", name: "x", dbUrl: "file:x.db" });
    expect(await uniqueTenantSlug("Green Valley")).toBe("green-valley-2");
  });
});

describe("signupClinic", () => {
  it("provisions a clinic the owner can log into", async () => {
    const out = await signupClinic(
      { clinicName: "Green Valley", ownerName: "Dr Green", email: "dr@green.test", password: "pw" },
      { createDb: localCreateDb }
    );
    expect(out.tenantId).toBe("green-valley");
    const session = await resolveLogin("dr@green.test", "pw");
    expect(session?.tenantId).toBe("green-valley");
    expect(session?.userId).toBe(out.tenantUserId);
    // seeded + trialing
    const tdb = await getTenantDb("green-valley");
    const presets = await runWithDb(tdb, () => query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets"));
    expect(presets[0].n).toBeGreaterThan(0);
  });

  it("rejects a duplicate email", async () => {
    await signupClinic({ clinicName: "Green Valley", ownerName: "Dr Green", email: "dup@green.test", password: "pw" }, { createDb: localCreateDb });
    await expect(
      signupClinic({ clinicName: "Green Valley Two", ownerName: "Dr Two", email: "dup@green.test", password: "pw" }, { createDb: localCreateDb })
    ).rejects.toMatchObject({ code: "email_taken" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/signup.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `lib/tenancy/slug.ts`**

```ts
import { listTenants } from "@/lib/control-users";

export function slugify(name: string): string {
  let s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (s.length < 3) s = (s + "-clinic").replace(/^-+/, "");
  return s.slice(0, 40).replace(/-+$/g, "");
}

export async function uniqueTenantSlug(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set((await listTenants()).map((t) => t.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("could not allocate a unique tenant slug");
}
```

- [ ] **Step 4: Create `lib/tenancy/create-db.ts`**

```ts
import { createTursoDatabase } from "@/lib/tenancy/turso";

// Real Turso when configured; a local file DB otherwise (so dev signup works
// with no token). Signature matches createTursoDatabase.
export function resolveCreateDb(): (name: string) => Promise<{ url: string; authToken: string }> {
  if (process.env.TURSO_PLATFORM_TOKEN && process.env.TURSO_ORG) return createTursoDatabase;
  return async (name: string) => ({ url: `file:tenant-${name}.db`, authToken: "" });
}
```

- [ ] **Step 5: Create `lib/tenancy/signup.ts`**

```ts
import { provisionTenant } from "@/lib/tenancy/provision";
import { uniqueTenantSlug } from "@/lib/tenancy/slug";
import { resolveCreateDb } from "@/lib/tenancy/create-db";
import { findControlUserByEmail } from "@/lib/control-users";
import { createTursoDatabase } from "@/lib/tenancy/turso";

export class SignupError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export async function signupClinic(
  input: { clinicName: string; ownerName: string; email: string; password: string },
  deps: { createDb?: typeof createTursoDatabase } = {}
): Promise<{ tenantId: string; tenantUserId: number }> {
  const email = input.email.trim().toLowerCase();
  if (await findControlUserByEmail(email)) {
    throw new SignupError("email_taken", "That email is already registered.");
  }
  const tenantId = await uniqueTenantSlug(input.clinicName);
  const { tenantUserId } = await provisionTenant(
    { tenantId, clinicName: input.clinicName.trim(), ownerEmail: email, ownerName: input.ownerName.trim(), ownerPassword: input.password },
    { createDb: deps.createDb ?? resolveCreateDb() }
  );
  return { tenantId, tenantUserId };
}
```

- [ ] **Step 6: Run test to verify it passes + full suite + commit**

```bash
npx vitest run test/signup.test.ts
npm test
git add lib/tenancy/slug.ts lib/tenancy/create-db.ts lib/tenancy/signup.ts test/signup.test.ts
git commit -m "feat: signup orchestration (slug + createDb resolver + signupClinic)"
```

---

### Task 2: Signup page + action

**Files:**
- Create: `app/signup/page.tsx`
- Create: `app/signup/actions.ts`
- Modify: `middleware.ts` (make `/signup` + `/api/signup` public — and `/api/billing/webhook`)
- Modify: `app/login/page.tsx` (add a "Create a clinic account" link — locate the existing login form and add the link below it)
- Test: covered by Task 1 (`signupClinic`); the page/action are thin.

**Interfaces:**
- Produces: `signupAction(formData: FormData)` server action → calls `signupClinic`, signs the session cookie, `redirect("/onboarding")`; on `SignupError` returns `{ error }`.

- [ ] **Step 1: Make signup + webhook public in middleware**

In `middleware.ts`, extend the `PUBLIC` list:

```ts
const PUBLIC = ["/login", "/api/login", "/signup", "/api/signup", "/api/billing/webhook"];
```

- [ ] **Step 2: Create the signup server action**

```ts
// app/signup/actions.ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signupClinic, SignupError } from "@/lib/tenancy/signup";
import { signSession } from "@/lib/auth/session";

export async function signupAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const clinicName = String(formData.get("clinicName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!clinicName || !ownerName || !email || password.length < 6) {
    return { error: "All fields required; password at least 6 characters." };
  }
  let result;
  try {
    result = await signupClinic({ clinicName, ownerName, email, password });
  } catch (e) {
    if (e instanceof SignupError) return { error: e.message };
    throw e;
  }
  const token = await signSession({ userId: result.tenantUserId, tenantId: result.tenantId, role: "admin", name: ownerName });
  cookies().set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/onboarding");
}
```

- [ ] **Step 3: Create the signup page (client form using the action)**

```tsx
// app/signup/page.tsx
"use client";
import { useFormState, useFormStatus } from "react-dom";
import { signupAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} style={{ width: "100%", padding: 10, marginTop: 12 }}>{pending ? "Creating your clinic…" : "Create clinic account"}</button>;
}

export default function SignupPage() {
  const [state, action] = useFormState(signupAction, {});
  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Create your clinic</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>Start your 14-day free trial.</p>
      <form action={action}>
        <label>Clinic name<input name="clinicName" required style={{ width: "100%", padding: 8 }} /></label>
        <label>Your name<input name="ownerName" required style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        <label>Email<input name="email" type="email" required style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        <label>Password<input name="password" type="password" required minLength={6} style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        {state?.error ? <p style={{ color: "#b00", marginTop: 8 }}>{state.error}</p> : null}
        <Submit />
      </form>
      <p style={{ marginTop: 16 }}><a href="/login">Already have an account? Sign in →</a></p>
    </main>
  );
}
```

- [ ] **Step 4: Link signup from the login page**

In `app/login/page.tsx`, add a link under the form: `<a href="/signup">Create a clinic account →</a>`. (Place it near the existing submit/footer markup.)

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm test
git add "app/signup/page.tsx" "app/signup/actions.ts" middleware.ts app/login/page.tsx
git commit -m "feat: self-service signup page + action (provisions clinic, signs in)"
```

---

### Task 3: Onboarding wizard

**Files:**
- Create: `app/onboarding/page.tsx`

**Interfaces:**
- A server component behind auth + subscription gate that greets the owner and links the first steps (upload catalogue, add a patient, invite team, go to dashboard). No new data model.

- [ ] **Step 1: Create the onboarding page**

```tsx
// app/onboarding/page.tsx
import { requireUser } from "@/lib/auth/current-user";
import { requireActiveSubscription } from "@/lib/billing/gate";

export default async function OnboardingPage() {
  const u = await requireUser();
  await requireActiveSubscription(u.tenantId);
  const steps: { title: string; body: string; href: string; cta: string }[] = [
    { title: "Add your supplement library", body: "Upload the products you prescribe, or add them as you go.", href: "/catalog", cta: "Open catalogue" },
    { title: "Add your first patient", body: "Create a patient record to build their plan.", href: "/patients", cta: "Add patient" },
    { title: "Invite your team", body: "Add practitioners who’ll use the clinic.", href: "/admin", cta: "Team settings" },
  ];
  return (
    <main style={{ maxWidth: 680, margin: "56px auto", padding: 24 }}>
      <h1 style={{ fontSize: 26 }}>Welcome, {u.name.split(" ")[0]} 👋</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Your clinic is set up and your free trial has started. A few things to get going:</p>
      <ol style={{ display: "grid", gap: 16, listStyle: "none", padding: 0 }}>
        {steps.map((s) => (
          <li key={s.href} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{s.title}</h2>
            <p style={{ color: "#555", margin: "6px 0 12px" }}>{s.body}</p>
            <a href={s.href} style={{ fontWeight: 600 }}>{s.cta} →</a>
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 24 }}><a href="/dashboard" style={{ fontWeight: 600 }}>Skip to dashboard →</a></p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/onboarding/page.tsx"
git commit -m "feat: onboarding wizard after signup"
```

---

### Task 4: Checkout button on the billing wall

**Files:**
- Modify: `app/billing/page.tsx` (add a Subscribe button when a price is configured)
- Create: `app/billing/actions.ts`

**Interfaces:**
- Produces: `startCheckoutAction()` server action → `createCheckoutSession` for the current tenant/owner using `STRIPE_PRICE_SOLO`, then `redirect(url)`. If `STRIPE_SECRET_KEY`/`STRIPE_PRICE_SOLO` are unset, the button is hidden (dev).

- [ ] **Step 1: Create the billing action**

```ts
// app/billing/actions.ts
"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createCheckoutSession } from "@/lib/billing/stripe";

export async function startCheckoutAction(): Promise<void> {
  const u = await requireUser();
  const priceId = process.env.STRIPE_PRICE_SOLO;
  if (!priceId) throw new Error("STRIPE_PRICE_SOLO not configured");
  const base = process.env.APP_BASE_URL || "http://localhost:3200";
  const url = await createCheckoutSession({
    tenantId: u.tenantId,
    priceId,
    customerEmail: `${u.userId}@tenant-${u.tenantId}.local`, // placeholder; replaced by the owner's email once captured on the account
    successUrl: `${base}/dashboard`,
    cancelUrl: `${base}/billing`,
  });
  redirect(url);
}
```

> Note: the owner's real email lives in the control-plane `users` table; a later refinement passes it here. For 0d the checkout flow is wired and functional with test keys; the customer email is cosmetic in Stripe test mode.

- [ ] **Step 2: Add the Subscribe button to the billing page**

In `app/billing/page.tsx`, add at the top: `import { startCheckoutAction } from "./actions";`. Inside the component, when not allowed and a price is configured, render a form that posts the action:

```tsx
      {!access.allowed && process.env.STRIPE_PRICE_SOLO ? (
        <form action={startCheckoutAction} style={{ marginTop: 16 }}>
          <button type="submit" style={{ padding: "10px 16px" }}>Subscribe to continue</button>
        </form>
      ) : null}
```

(Place it after the existing paused-access paragraph.)

- [ ] **Step 3: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm test
git add "app/billing/page.tsx" "app/billing/actions.ts"
git commit -m "feat: Stripe checkout button on the billing wall"
```

- [ ] **Step 4: Dev smoke (no token needed)**

Start the dev server. Visit `/signup`, create "Test Clinic" with a new email — you should be provisioned (a `file:tenant-test-clinic.db` is created), signed in, and land on `/onboarding`. Confirm `/dashboard` then loads (trial active). Confirm the new clinic cannot see Lorna's patients (its catalogue/patients are empty — isolation).

---

## Self-Review

**Spec coverage (spec §3 signup/onboarding + §3.5 checkout):**
- Self-service signup provisions a working clinic → Tasks 1, 2. ✓
- Onboarding wizard → Task 3. ✓
- Checkout to convert the trial → Task 4. ✓
- Dev works with no token (local file DB) → Task 1 resolver. ✓

**Placeholder scan:** No TBD/TODO. The checkout `customerEmail` placeholder is explicitly annotated as a cosmetic test-mode value with the real-email refinement noted; the flow is complete and functional.

**Type consistency:** `signupClinic` returns `{ tenantId, tenantUserId }` consumed by `signupAction` to build the `SessionPayload` (0a shape). `resolveCreateDb` return type matches `provisionTenant`'s `deps.createDb`. `createCheckoutSession` input matches Task 2 of 0c.

**Isolation guarantee:** a new clinic gets its own database (file in dev, Turso in prod) — Task 4 smoke explicitly verifies it cannot see Lorna's data.

**Known follow-ups:** capture + store the owner's email for Stripe customer; email verification on signup; per-route gating (noted in 0c); team-member invites creating control-plane logins (future). These do not block Phase 0.
