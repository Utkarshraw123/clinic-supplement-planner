# Phase 0c — Stripe Billing + Access Gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the platform subscription billing: each tenant has a subscription (free trial on provision), Stripe drives checkout/portal/webhooks, and access is gated on subscription status.

**Architecture:** A control-plane `subscriptions` table (one row per tenant) holds Stripe ids + status + trial end. A pure `subscriptionAccess()` function decides allow/block from a subscription row. `provisionTenant` starts a 14-day trial. A Stripe wrapper creates Checkout/Portal sessions; a pure `applyStripeEvent()` maps webhook events to subscription upserts, called by a signature-verifying webhook route. A node-runtime `requireActiveSubscription()` helper gates the dashboard (and is reusable on other protected pages).

**Tech Stack:** Next.js 14, `stripe` SDK (installed), `@libsql/client`, `vitest`.

## Global Constraints

- Stripe secrets from env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO` (+ later tiers). Never hard-code or log them. All are **free test-mode** values.
- Subscription data is **control-plane** (`getControlDb`), not per-tenant.
- `subscriptionAccess()` is pure (no I/O) so it is fully unit-tested.
- Gating runs in the **node** runtime (server components/helpers), never in edge middleware (the control DB is a local file in dev).
- Keep `npm test` green (currently 164).

---

### Task 1: Subscriptions model + access logic + trial on provision

**Files:**
- Modify: `lib/control-schema.sql` (add `subscriptions`)
- Create: `lib/billing/subscriptions.ts`
- Modify: `lib/tenancy/provision.ts` (start a trial after provisioning)
- Modify: `test/provision.test.ts` (assert a trial exists)
- Test: `test/subscriptions.test.ts`

**Interfaces:**
- Produces:
  - `type SubscriptionRow = { tenant_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; tier: string | null; seats: number | null; status: string; trial_ends_at: string | null; current_period_end: string | null }`.
  - `upsertSubscription(input: Partial<SubscriptionRow> & { tenant_id: string; status: string }): Promise<void>`.
  - `getSubscription(tenantId: string): Promise<SubscriptionRow | null>`.
  - `startTrial(tenantId: string, days?: number): Promise<void>` — status `trialing`, `trial_ends_at = now + days` (default 14).
  - `subscriptionAccess(sub: SubscriptionRow | null, now?: Date): { allowed: boolean; reason: string }` — pure.
- Consumes: `getControlDb`.

- [ ] **Step 1: Write the failing test**

```ts
// test/subscriptions.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertSubscription, getSubscription, startTrial, subscriptionAccess } from "@/lib/billing/subscriptions";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

beforeEach(resetControl);

describe("subscriptions", () => {
  it("startTrial creates a trialing row that getSubscription reads back", async () => {
    await startTrial("acme", 14);
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("trialing");
    expect(sub?.trial_ends_at).toBeTruthy();
  });

  it("upsertSubscription updates status in place", async () => {
    await startTrial("acme");
    await upsertSubscription({ tenant_id: "acme", status: "active", tier: "solo" });
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("active");
    expect(sub?.tier).toBe("solo");
  });

  describe("subscriptionAccess (pure)", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const base = { tenant_id: "x", stripe_customer_id: null, stripe_subscription_id: null, tier: null, seats: null, current_period_end: null };
    it("blocks a missing subscription", () => {
      expect(subscriptionAccess(null, now).allowed).toBe(false);
    });
    it("allows active, comp, and in-date trialing; blocks expired trial, canceled", () => {
      expect(subscriptionAccess({ ...base, status: "active", trial_ends_at: null }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "comp", trial_ends_at: null }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "trialing", trial_ends_at: "2026-02-10T00:00:00Z" }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "trialing", trial_ends_at: "2026-01-20T00:00:00Z" }, now).allowed).toBe(false);
      expect(subscriptionAccess({ ...base, status: "canceled", trial_ends_at: null }, now).allowed).toBe(false);
    });
    it("allows past_due as a grace state", () => {
      expect(subscriptionAccess({ ...base, status: "past_due", trial_ends_at: null }, now).allowed).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/subscriptions.test.ts`
Expected: FAIL — `@/lib/billing/subscriptions` not found.

- [ ] **Step 3: Add the schema table**

In `lib/control-schema.sql`, after the `memberships` table:

```sql
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
```

- [ ] **Step 4: Create `lib/billing/subscriptions.ts`**

```ts
import { getControlDb } from "@/lib/db";

export type SubscriptionRow = {
  tenant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: string | null;
  seats: number | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

const ALLOWED_STATUSES = new Set(["active", "comp", "past_due"]);

export async function getSubscription(tenantId: string): Promise<SubscriptionRow | null> {
  const rs = await getControlDb().execute({ sql: "SELECT * FROM subscriptions WHERE tenant_id = ?", args: [tenantId] });
  const r = rs.rows[0];
  if (!r) return null;
  return {
    tenant_id: String(r.tenant_id),
    stripe_customer_id: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
    stripe_subscription_id: r.stripe_subscription_id ? String(r.stripe_subscription_id) : null,
    tier: r.tier ? String(r.tier) : null,
    seats: r.seats != null ? Number(r.seats) : null,
    status: String(r.status),
    trial_ends_at: r.trial_ends_at ? String(r.trial_ends_at) : null,
    current_period_end: r.current_period_end ? String(r.current_period_end) : null,
  };
}

export async function upsertSubscription(input: Partial<SubscriptionRow> & { tenant_id: string; status: string }): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO subscriptions (tenant_id, stripe_customer_id, stripe_subscription_id, tier, seats, status, trial_ends_at, current_period_end)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id) DO UPDATE SET
            stripe_customer_id=COALESCE(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
            stripe_subscription_id=COALESCE(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
            tier=COALESCE(excluded.tier, subscriptions.tier),
            seats=COALESCE(excluded.seats, subscriptions.seats),
            status=excluded.status,
            trial_ends_at=COALESCE(excluded.trial_ends_at, subscriptions.trial_ends_at),
            current_period_end=COALESCE(excluded.current_period_end, subscriptions.current_period_end)`,
    args: [
      input.tenant_id,
      input.stripe_customer_id ?? null,
      input.stripe_subscription_id ?? null,
      input.tier ?? null,
      input.seats ?? null,
      input.status,
      input.trial_ends_at ?? null,
      input.current_period_end ?? null,
    ],
  });
}

export async function startTrial(tenantId: string, days = 14): Promise<void> {
  const ends = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await upsertSubscription({ tenant_id: tenantId, status: "trialing", trial_ends_at: ends });
}

// Pure gate: decide whether a tenant may use the app from its subscription row.
export function subscriptionAccess(sub: SubscriptionRow | null, now: Date = new Date()): { allowed: boolean; reason: string } {
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (ALLOWED_STATUSES.has(sub.status)) return { allowed: true, reason: sub.status };
  if (sub.status === "trialing") {
    if (sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now.getTime()) {
      return { allowed: true, reason: "trialing" };
    }
    return { allowed: false, reason: "trial_expired" };
  }
  return { allowed: false, reason: sub.status };
}
```

- [ ] **Step 5: Start a trial when a clinic is provisioned**

In `lib/tenancy/provision.ts`, add the import `import { startTrial } from "@/lib/billing/subscriptions";` and call it right before `await setJob(input.tenantId, "done");`:

```ts
    await startTrial(input.tenantId);
    await setJob(input.tenantId, "done");
```

- [ ] **Step 6: Assert the trial in the provision test**

In `test/provision.test.ts`, inside the happy-path test, after the job assertion add:

```ts
    const { getSubscription } = await import("@/lib/billing/subscriptions");
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("trialing");
```
Also add `"subscriptions"` to the list of tables dropped in that file's `resetControl()`.

- [ ] **Step 7: Run tests + full suite + commit**

```bash
npx vitest run test/subscriptions.test.ts test/provision.test.ts
npm test
git add lib/control-schema.sql lib/billing/subscriptions.ts lib/tenancy/provision.ts test/subscriptions.test.ts test/provision.test.ts
git commit -m "feat: tenant subscriptions + pure access gate + trial on provision"
```

---

### Task 2: Stripe wrapper (checkout + portal)

**Files:**
- Create: `lib/billing/stripe.ts`
- Test: `test/stripe-wrapper.test.ts`

**Interfaces:**
- Produces:
  - `getStripe(): Stripe` — lazily constructed from `STRIPE_SECRET_KEY`.
  - `createCheckoutSession(input: { tenantId: string; priceId: string; customerEmail: string; successUrl: string; cancelUrl: string }): Promise<string>` — returns the Checkout URL.
  - `createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>` — returns the Portal URL.
- Reads env: `STRIPE_SECRET_KEY`.

- [ ] **Step 1: Write the failing test (inject a fake Stripe via module mock)**

```ts
// test/stripe-wrapper.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("stripe", () => {
  return {
    default: class FakeStripe {
      checkout = { sessions: { create: vi.fn(async (args: any) => ({ url: `https://checkout/${args.metadata.tenantId}` })) } };
      billingPortal = { sessions: { create: vi.fn(async (args: any) => ({ url: `https://portal/${args.customer}` })) } };
      constructor(public key: string) {}
    },
  };
});

beforeEach(() => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; });

describe("stripe wrapper", () => {
  it("creates a checkout session URL carrying the tenant id", async () => {
    const { createCheckoutSession } = await import("@/lib/billing/stripe");
    const url = await createCheckoutSession({ tenantId: "acme", priceId: "price_1", customerEmail: "o@acme.test", successUrl: "s", cancelUrl: "c" });
    expect(url).toBe("https://checkout/acme");
  });
  it("creates a portal session URL for a customer", async () => {
    const { createPortalSession } = await import("@/lib/billing/stripe");
    const url = await createPortalSession({ customerId: "cus_1", returnUrl: "r" });
    expect(url).toBe("https://portal/cus_1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/stripe-wrapper.test.ts`
Expected: FAIL — `@/lib/billing/stripe` not found.

- [ ] **Step 3: Create `lib/billing/stripe.ts`**

```ts
import Stripe from "stripe";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY must be set");
  _stripe = new Stripe(key);
  return _stripe;
}

export async function createCheckoutSession(input: {
  tenantId: string; priceId: string; customerEmail: string; successUrl: string; cancelUrl: string;
}): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: { metadata: { tenantId: input.tenantId } },
    metadata: { tenantId: input.tenantId },
  });
  if (!session.url) throw new Error("Stripe checkout: no url");
  return session.url;
}

export async function createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return session.url;
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

```bash
npx vitest run test/stripe-wrapper.test.ts
git add lib/billing/stripe.ts test/stripe-wrapper.test.ts
git commit -m "feat: Stripe wrapper (checkout + portal sessions)"
```

---

### Task 3: Webhook event mapping + route

**Files:**
- Create: `lib/billing/webhook.ts`
- Create: `app/api/billing/webhook/route.ts`
- Test: `test/billing-webhook.test.ts`

**Interfaces:**
- Produces: `applyStripeEvent(event: { type: string; data: { object: any } }): Promise<{ handled: boolean; tenantId?: string }>` — pure mapping of the relevant events to `upsertSubscription`.
- Consumes: `upsertSubscription` (Task 1).
- Webhook route verifies the signature with `getStripe().webhooks.constructEvent` then calls `applyStripeEvent`.

Handled events:
- `checkout.session.completed` → status `active`, store `stripe_customer_id`, `stripe_subscription_id`, tenantId from `metadata.tenantId`.
- `customer.subscription.updated` → map Stripe status, store `current_period_end`; tenantId from `metadata.tenantId`.
- `customer.subscription.deleted` → status `canceled`.
- `invoice.payment_failed` → status `past_due`.

- [ ] **Step 1: Write the failing test**

```ts
// test/billing-webhook.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { applyStripeEvent } from "@/lib/billing/webhook";
import { getSubscription } from "@/lib/billing/subscriptions";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}
beforeEach(resetControl);

describe("applyStripeEvent", () => {
  it("activates on checkout.session.completed and stores stripe ids", async () => {
    const res = await applyStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { tenantId: "acme" }, customer: "cus_1", subscription: "sub_1" } },
    });
    expect(res).toEqual({ handled: true, tenantId: "acme" });
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("active");
    expect(sub?.stripe_customer_id).toBe("cus_1");
    expect(sub?.stripe_subscription_id).toBe("sub_1");
  });

  it("sets past_due on invoice.payment_failed and canceled on subscription.deleted", async () => {
    await applyStripeEvent({ type: "checkout.session.completed", data: { object: { metadata: { tenantId: "acme" }, customer: "c", subscription: "s" } } });
    await applyStripeEvent({ type: "invoice.payment_failed", data: { object: { subscription: "s", lines: { data: [{ metadata: { tenantId: "acme" } }] }, subscription_details: { metadata: { tenantId: "acme" } } } } });
    expect((await getSubscription("acme"))?.status).toBe("past_due");
    await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { metadata: { tenantId: "acme" } } } });
    expect((await getSubscription("acme"))?.status).toBe("canceled");
  });

  it("ignores unrelated events", async () => {
    const res = await applyStripeEvent({ type: "ping", data: { object: {} } });
    expect(res.handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/billing-webhook.test.ts`
Expected: FAIL — `@/lib/billing/webhook` not found.

- [ ] **Step 3: Create `lib/billing/webhook.ts`**

```ts
import { upsertSubscription } from "@/lib/billing/subscriptions";

function tenantIdOf(obj: any): string | undefined {
  return obj?.metadata?.tenantId
    ?? obj?.subscription_details?.metadata?.tenantId
    ?? obj?.lines?.data?.[0]?.metadata?.tenantId;
}

// Map a Stripe status to our subscription status.
function mapStatus(s: string): string {
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled" || s === "unpaid") return s === "unpaid" ? "past_due" : s;
  if (s === "incomplete" || s === "incomplete_expired") return "canceled";
  return s;
}

export async function applyStripeEvent(event: { type: string; data: { object: any } }): Promise<{ handled: boolean; tenantId?: string }> {
  const obj = event.data.object;
  const tenantId = tenantIdOf(obj);

  switch (event.type) {
    case "checkout.session.completed": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({
        tenant_id: tenantId,
        status: "active",
        stripe_customer_id: obj.customer ?? null,
        stripe_subscription_id: obj.subscription ?? null,
      });
      return { handled: true, tenantId };
    }
    case "customer.subscription.updated": {
      if (!tenantId) return { handled: false };
      const cpe = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : undefined;
      await upsertSubscription({ tenant_id: tenantId, status: mapStatus(String(obj.status ?? "active")), current_period_end: cpe });
      return { handled: true, tenantId };
    }
    case "customer.subscription.deleted": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({ tenant_id: tenantId, status: "canceled" });
      return { handled: true, tenantId };
    }
    case "invoice.payment_failed": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({ tenant_id: tenantId, status: "past_due" });
      return { handled: true, tenantId };
    }
    default:
      return { handled: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/billing-webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the webhook route**

```ts
// app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { applyStripeEvent } from "@/lib/billing/webhook";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  await applyStripeEvent(event as unknown as { type: string; data: { object: any } });
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 6: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm test
git add lib/billing/webhook.ts "app/api/billing/webhook/route.ts" test/billing-webhook.test.ts
git commit -m "feat: Stripe webhook mapping + signature-verifying route"
```

---

### Task 4: Access gate wired to the dashboard

**Files:**
- Create: `lib/billing/gate.ts`
- Modify: `app/dashboard/page.tsx` (call the gate)
- Modify: `scripts/bootstrap-dev-tenant.ts` (give the dev tenant a `comp` subscription so dev isn't blocked)
- Create: `app/billing/page.tsx` (the billing wall)
- Test: covered by `subscriptionAccess` unit tests (Task 1); add `test/gate.test.ts` for the resolver

**Interfaces:**
- Produces: `checkTenantAccess(tenantId: string): Promise<{ allowed: boolean; reason: string }>` in `lib/billing/gate.ts` (DB read + pure gate).
- Produces: `requireActiveSubscription(tenantId: string): Promise<void>` — redirects to `/billing` when not allowed.
- Consumes: `getSubscription`, `subscriptionAccess` (Task 1), `redirect` (next/navigation).

- [ ] **Step 1: Write the failing test**

```ts
// test/gate.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { startTrial, upsertSubscription } from "@/lib/billing/subscriptions";
import { checkTenantAccess } from "@/lib/billing/gate";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}
beforeEach(resetControl);

describe("checkTenantAccess", () => {
  it("allows a fresh trial, blocks a tenant with no subscription", async () => {
    expect((await checkTenantAccess("ghost")).allowed).toBe(false);
    await startTrial("acme");
    expect((await checkTenantAccess("acme")).allowed).toBe(true);
  });
  it("blocks a canceled tenant", async () => {
    await upsertSubscription({ tenant_id: "acme", status: "canceled" });
    expect((await checkTenantAccess("acme")).allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gate.test.ts`
Expected: FAIL — `@/lib/billing/gate` not found.

- [ ] **Step 3: Create `lib/billing/gate.ts`**

```ts
import { redirect } from "next/navigation";
import { getSubscription, subscriptionAccess } from "@/lib/billing/subscriptions";

export async function checkTenantAccess(tenantId: string): Promise<{ allowed: boolean; reason: string }> {
  const sub = await getSubscription(tenantId);
  return subscriptionAccess(sub);
}

export async function requireActiveSubscription(tenantId: string): Promise<void> {
  const { allowed } = await checkTenantAccess(tenantId);
  if (!allowed) redirect("/billing");
}
```

- [ ] **Step 4: Gate the dashboard**

In `app/dashboard/page.tsx`, the page already resolves the user (it uses `requireUser`/role). Add the gate right after the user is resolved. At the top add the import `import { requireActiveSubscription } from "@/lib/billing/gate";`, and after the `const u = await requireUser()` (or equivalent) line add:

```ts
  await requireActiveSubscription(u.tenantId);
```

(`u` is the `SessionPayload`; it now has `tenantId`. If the page calls `requireAdmin()`/`requireUser()` into a differently-named variable, use that variable's `.tenantId`.)

- [ ] **Step 5: Create the billing wall page**

```tsx
// app/billing/page.tsx
import { requireUser } from "@/lib/auth/current-user";
import { getSubscription, subscriptionAccess } from "@/lib/billing/subscriptions";

export default async function BillingPage() {
  const u = await requireUser();
  const sub = await getSubscription(u.tenantId);
  const access = subscriptionAccess(sub);
  return (
    <main style={{ maxWidth: 560, margin: "64px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Subscription</h1>
      <p style={{ color: "#555" }}>
        Status: <strong>{sub?.status ?? "none"}</strong>
        {sub?.trial_ends_at ? ` · trial ends ${new Date(sub.trial_ends_at).toLocaleDateString()}` : ""}
      </p>
      {access.allowed ? (
        <p style={{ marginTop: 16 }}>Your subscription is active. <a href="/dashboard">Go to dashboard →</a></p>
      ) : (
        <p style={{ marginTop: 16 }}>Your access is paused ({access.reason}). Please contact support to continue — online checkout coming with onboarding.</p>
      )}
    </main>
  );
}
```

(Checkout/portal buttons are wired in Plan 0d onboarding; this page is the wall + status for 0c.)

- [ ] **Step 6: Give the dev tenant a comp subscription**

In `scripts/bootstrap-dev-tenant.ts`, add the import `import { upsertSubscription } from "../lib/billing/subscriptions";` and, after `addMembership(...)`, add:

```ts
  await upsertSubscription({ tenant_id: TENANT_ID, status: "comp" });
```

- [ ] **Step 7: Run tests, typecheck, full suite, re-bootstrap, smoke, commit**

```bash
npx vitest run test/gate.test.ts
npx tsc --noEmit
npm test
rm -f control.db && npm run bootstrap:dev
```
Smoke: start the dev server, log in — the dashboard loads (comp subscription). Temporarily set the dev tenant to `canceled` (`upsertSubscription` in a scratch script or DB) and confirm `/dashboard` redirects to `/billing`; then restore `comp`.
Commit:
```bash
git add lib/billing/gate.ts app/dashboard/page.tsx "app/billing/page.tsx" scripts/bootstrap-dev-tenant.ts test/gate.test.ts
git commit -m "feat: subscription access gate on dashboard + billing wall page"
```

---

## Self-Review

**Spec coverage (spec §3.5 billing):**
- Subscription per tenant + trial → Task 1. ✓
- Stripe Checkout + Customer Portal → Task 2. ✓
- Webhooks keep status in sync → Task 3. ✓
- Access gated on status → Tasks 1 (pure) + 4 (wired). ✓
- Signup conversion (checkout button in onboarding) → **Plan 0d**.

**Placeholder scan:** No TBD/TODO; all code complete. Task 4 Step 4 references the dashboard's existing user-resolution variable generically with the exact line to add and the rule — unambiguous.

**Type consistency:** `SubscriptionRow` (Task 1) is consumed by `subscriptionAccess`, `applyStripeEvent` (via `upsertSubscription`), and `gate.ts`. `upsertSubscription` COALESCE-merge keeps prior Stripe ids when a later event omits them. Gate uses `u.tenantId` from the Phase 0a `SessionPayload`.

**Gating scope (honest note):** 0c gates the **dashboard** (the hub) in the node runtime. Full per-route gating via an `app/(app)` route-group layout is a small, clean follow-up — deferred to avoid moving many route folders now. Data is already protected by tenant isolation + auth; this gate is the commercial lock.

**Known follow-up:** exact Stripe test price ids (`STRIPE_PRICE_*`) are set when the free Stripe test account is connected (Plan 0d wires the checkout button that uses them).
