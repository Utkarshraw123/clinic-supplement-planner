# Phase 3b-3 — Stripe Payment Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mock-safe helper that turns a finalised invoice into a Stripe Payment Link URL (patient pays by card), using the practitioner's own per-tenant Stripe key — and a deterministic mock URL when no key is set.

**Architecture:** `lib/billing/payment-links.ts` takes an `InvoiceRow` + an optional Stripe secret key (the caller reads it from `clinic_settings.stripe_secret_key`). With a key, it creates a one-off Stripe Price for the invoice total + a Payment Link. With no key, it returns a mock URL and `mocked:true`. The key is passed in, never read from `process.env` here, so each tenant uses its own.

**Tech Stack:** `stripe` SDK (already a dependency), `vitest`.

## Global Constraints

- **Depends on 3b-1** (`InvoiceRow`, `lib/settings.ts` returns `stripe_secret_key`).
- **Mock-safe:** no key → mock URL, `mocked:true`; dev + tests cost $0.
- Per-tenant key only; never read the control-plane `STRIPE_SECRET_KEY` here.
- Amount comes from `invoice.total_cents` (integer cents); currency from `invoice.currency`.
- Keep `npm test` green and `npx tsc --noEmit` clean.

---

### Task 1: `createPaymentLink` (mock-safe)

**Files:**
- Create: `lib/billing/payment-links.ts`
- Test: `test/payment-links.test.ts`

**Interfaces:**
- Consumes: `InvoiceRow` (`@/lib/invoices`), `Stripe` (`stripe`).
- Produces: `createPaymentLink(input: { invoice: InvoiceRow; key?: string | null; productName?: string }): Promise<{ url: string; mocked: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/payment-links.test.ts
import { describe, it, expect } from "vitest";
import { createPaymentLink } from "@/lib/billing/payment-links";
import type { InvoiceRow } from "@/lib/invoices";

const invoice: InvoiceRow = {
  id: 7, patient_id: 1, number: "INV-0007", status: "sent",
  issue_date: "2026-10-31", due_date: null, currency: "EUR",
  subtotal_cents: 10000, tax_rate: 23, tax_cents: 2300, total_cents: 12300,
  notes: null, payment_link_url: null, paid_at: null, paid_method: null,
  created_by: 1, created_at: "", updated_at: "",
};

describe("createPaymentLink", () => {
  it("returns a deterministic mock URL when no key is set", async () => {
    const res = await createPaymentLink({ invoice });
    expect(res.mocked).toBe(true);
    expect(res.url).toContain("pay.mock");
    expect(res.url).toContain("INV-0007");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/payment-links.test.ts`
Expected: FAIL — `@/lib/billing/payment-links` not found.

- [ ] **Step 3: Create `lib/billing/payment-links.ts`**

```ts
import Stripe from "stripe";
import type { InvoiceRow } from "@/lib/invoices";

export async function createPaymentLink(input: { invoice: InvoiceRow; key?: string | null; productName?: string }): Promise<{ url: string; mocked: boolean }> {
  const key = input.key ?? undefined;
  const ref = input.invoice.number ?? String(input.invoice.id);
  if (!key) {
    return { url: `https://pay.mock/invoice/${ref}`, mocked: true };
  }
  const stripe = new Stripe(key);
  const price = await stripe.prices.create({
    currency: (input.invoice.currency || "EUR").toLowerCase(),
    unit_amount: input.invoice.total_cents,
    product_data: { name: input.productName ?? `Invoice ${ref}` },
  });
  const link = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });
  return { url: link.url, mocked: false };
}
```

- [ ] **Step 4: Run test + typecheck + commit**

```bash
npx vitest run test/payment-links.test.ts
npx tsc --noEmit
git add lib/billing/payment-links.ts test/payment-links.test.ts
git commit -m "feat(3b): mock-safe Stripe payment link for an invoice (per-tenant key)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** per-tenant Stripe Payment Link ✓; mock-safe ✓; amount/currency from the invoice ✓; key passed in (per-tenant) ✓.
- **Placeholder scan:** none.
- **Type consistency:** `createPaymentLink` consumes `InvoiceRow` (3b-1) and returns `{ url, mocked }`, consumed by `createPayLinkAction` in 3b-4.
- **Known follow-ups:** verify the `stripe.prices.create` / `paymentLinks.create` field names against the installed `stripe` SDK version when a real key is first used; webhook auto-reconciliation remains a deferred non-goal (manual Mark paid in 3b-4).
