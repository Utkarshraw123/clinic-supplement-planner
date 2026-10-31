# Phase 3b-1 — Invoice Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tenant-DB data model + pure/typed library for client-facing invoices: create a draft, edit it, finalise it (sequential number + VAT snapshot), mark it paid or void — all in integer cents, audited, mock-safe, no UI.

**Architecture:** Two new tenant tables (`invoices`, `invoice_items`) + six `clinic_settings` columns (currency, VAT rate/number, invoice prefix/counter, Stripe key). `lib/invoices.ts` holds a pure `computeTotals` plus the CRUD + lifecycle functions. `lib/settings.ts` is extended to read the new columns and to save the invoicing config (leaving the counter and secret key to dedicated writers). Totals are always recomputed server-side from items; tax is applied only at finalise, snapshotting the rate.

**Tech Stack:** Next.js 14, `@libsql/client`, `vitest`, `tsx`.

## Global Constraints

- **Money is integer cents everywhere.** No floats in money math; round each line with `Math.round(quantity * unitPriceCents)`, tax with `Math.round(subtotal * rate / 100)`.
- **Mock-safe:** the engine needs no external keys; it works against the local file DB in tests.
- **Never put `;` inside a SQL comment** in `lib/schema.sql` (the migrator splits on `;`).
- **Run `npm run migrate:all` after editing `schema.sql`** (updates local.db + all tenant DBs).
- Audit every state change with a **PII-free** `detail` (ids only, e.g. `"invoice 12 (INV-0001)"`).
- `status` is one of `draft|sent|paid|void`; `sent` = finalised/issued.
- Keep `npm test` green (currently 206) and `npx tsc --noEmit` clean.

---

### Task 1: Schema + migration

**Files:**
- Modify: `lib/schema.sql` (add two tables at the end)
- Modify: `scripts/migrate.ts` (add six `ensureColumn` calls)

**Interfaces:**
- Produces: tables `invoices`, `invoice_items`; `clinic_settings` columns `currency, vat_rate, vat_number, invoice_prefix, invoice_next_seq, stripe_secret_key`.

- [ ] **Step 1: Add the tables to `lib/schema.sql`**

Append at the end of the file (no `;` in any comment line):

```sql
-- Client-facing invoices (Phase 3b). Practitioner bills the patient. Money in integer cents.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  payment_link_url TEXT,
  paid_at TEXT,
  paid_method TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  appointment_id INTEGER,
  plan_id INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 2: Add the settings columns in `scripts/migrate.ts`**

Immediately after the existing `await ensureColumn("clinic_settings", "letterhead_template", "TEXT");` line, add:

```ts
  // Phase 3b invoicing config (per-tenant).
  await ensureColumn("clinic_settings", "currency", "TEXT NOT NULL DEFAULT 'EUR'");
  await ensureColumn("clinic_settings", "vat_rate", "REAL");
  await ensureColumn("clinic_settings", "vat_number", "TEXT");
  await ensureColumn("clinic_settings", "invoice_prefix", "TEXT NOT NULL DEFAULT 'INV-'");
  await ensureColumn("clinic_settings", "invoice_next_seq", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("clinic_settings", "stripe_secret_key", "TEXT");
```

- [ ] **Step 3: Apply migrations**

Run: `npm run migrate:all`
Expected: `migrated control + N tenant(s): ...` with no error.

- [ ] **Step 4: Commit**

```bash
git add lib/schema.sql scripts/migrate.ts
git commit -m "feat(3b): invoices + invoice_items tables, invoicing settings columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extend `lib/settings.ts`

**Files:**
- Modify: `lib/settings.ts`
- Test: `test/invoice-settings.test.ts`

**Interfaces:**
- Consumes: `query`, `execute` from `@/lib/db`.
- Produces:
  - `type ClinicSettings` now also has `currency: string|null; vat_rate: number|null; vat_number: string|null; invoice_prefix: string|null; invoice_next_seq: number|null; stripe_secret_key: string|null`.
  - `getClinicSettings(): Promise<ClinicSettings>` returns all columns.
  - `saveInvoiceSettings(input: { currency: string|null; vat_rate: number|null; vat_number: string|null; invoice_prefix: string|null }): Promise<void>` (upsert on id=1; never touches the counter or secret key).
  - `setStripeSecretKey(key: string): Promise<void>` (upsert on id=1).
  - Existing `saveClinicSettings(input: BaseClinicSettings)` keeps its old 6-field shape, unchanged behaviour.

- [ ] **Step 1: Write the failing test**

```ts
// test/invoice-settings.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { getClinicSettings, saveInvoiceSettings, setStripeSecretKey } from "@/lib/settings";

describe("invoice settings", () => {
  beforeAll(async () => { await runMigrations(); });

  it("saves and reads invoicing config without clobbering the counter", async () => {
    await saveInvoiceSettings({ currency: "EUR", vat_rate: 23, vat_number: "IE1234567X", invoice_prefix: "LDN-" });
    const s1 = await getClinicSettings();
    expect(s1.currency).toBe("EUR");
    expect(s1.vat_rate).toBe(23);
    expect(s1.vat_number).toBe("IE1234567X");
    expect(s1.invoice_prefix).toBe("LDN-");
    expect(typeof s1.invoice_next_seq).toBe("number"); // defaulted, not null

    await setStripeSecretKey("sk_test_abc");
    const s2 = await getClinicSettings();
    expect(s2.stripe_secret_key).toBe("sk_test_abc");
    // saving invoice settings again must not wipe the key
    await saveInvoiceSettings({ currency: "GBP", vat_rate: null, vat_number: null, invoice_prefix: "INV-" });
    const s3 = await getClinicSettings();
    expect(s3.stripe_secret_key).toBe("sk_test_abc");
    expect(s3.currency).toBe("GBP");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoice-settings.test.ts`
Expected: FAIL — `saveInvoiceSettings`/`setStripeSecretKey` not exported.

- [ ] **Step 3: Replace `lib/settings.ts` with the extended version**

```ts
import { query, execute } from "@/lib/db";

export type BaseClinicSettings = { clinic_name: string|null; logo_url: string|null; address: string|null; contact: string|null; email_from: string|null; letterhead_template: string|null };
export type ClinicSettings = BaseClinicSettings & {
  currency: string|null; vat_rate: number|null; vat_number: string|null;
  invoice_prefix: string|null; invoice_next_seq: number|null; stripe_secret_key: string|null;
};

export async function getClinicSettings(): Promise<ClinicSettings> {
  const rows = await query<ClinicSettings>(
    `SELECT clinic_name, logo_url, address, contact, email_from, letterhead_template,
            currency, vat_rate, vat_number, invoice_prefix, invoice_next_seq, stripe_secret_key
       FROM clinic_settings WHERE id = 1`
  );
  return rows[0] ?? {
    clinic_name: null, logo_url: null, address: null, contact: null, email_from: null, letterhead_template: null,
    currency: null, vat_rate: null, vat_number: null, invoice_prefix: null, invoice_next_seq: null, stripe_secret_key: null,
  };
}

export async function saveClinicSettings(input: BaseClinicSettings): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, clinic_name, logo_url, address, contact, email_from, letterhead_template)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET clinic_name = excluded.clinic_name, logo_url = excluded.logo_url,
       address = excluded.address, contact = excluded.contact, email_from = excluded.email_from,
       letterhead_template = excluded.letterhead_template`,
    [input.clinic_name, input.logo_url, input.address, input.contact, input.email_from, input.letterhead_template]
  );
}

export async function saveInvoiceSettings(input: { currency: string|null; vat_rate: number|null; vat_number: string|null; invoice_prefix: string|null }): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, currency, vat_rate, vat_number, invoice_prefix)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, vat_rate = excluded.vat_rate,
       vat_number = excluded.vat_number, invoice_prefix = excluded.invoice_prefix`,
    [input.currency || "EUR", input.vat_rate, input.vat_number, input.invoice_prefix || "INV-"]
  );
}

export async function setStripeSecretKey(key: string): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, stripe_secret_key) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET stripe_secret_key = excluded.stripe_secret_key`,
    [key]
  );
}
```

- [ ] **Step 4: Run test + typecheck**

```bash
npx vitest run test/invoice-settings.test.ts
npx tsc --noEmit
```
Expected: test PASS, tsc exit 0 (the existing `app/admin/settings/actions.ts` still compiles — `saveClinicSettings` keeps its `BaseClinicSettings` shape).

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts test/invoice-settings.test.ts
git commit -m "feat(3b): read/write invoicing settings (currency, VAT, prefix, Stripe key)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `computeTotals` (pure)

**Files:**
- Create: `lib/invoices.ts` (start it with just `computeTotals` + the types)
- Test: `test/invoice-totals.test.ts`

**Interfaces:**
- Produces:
  - `type InvoiceStatus = "draft"|"sent"|"paid"|"void"`
  - `type InvoiceItemInput = { description: string; quantity: number; unitPriceCents: number; source?: string; appointmentId?: number; planId?: number }`
  - `type InvoiceRow` and `type InvoiceItemRow` (full column shapes — see code below)
  - `computeTotals(items: { quantity: number; unitPriceCents: number }[], taxRate: number|null): { subtotalCents: number; taxCents: number; totalCents: number }`

- [ ] **Step 1: Write the failing test**

```ts
// test/invoice-totals.test.ts
import { describe, it, expect } from "vitest";
import { computeTotals } from "@/lib/invoices";

describe("computeTotals", () => {
  it("sums lines with rounding and applies no tax when rate is null/0", () => {
    const items = [
      { quantity: 1, unitPriceCents: 7500 },
      { quantity: 0.5, unitPriceCents: 7500 }, // 3750
      { quantity: 3, unitPriceCents: 1000 },   // 3000
    ];
    expect(computeTotals(items, null)).toEqual({ subtotalCents: 14250, taxCents: 0, totalCents: 14250 });
    expect(computeTotals(items, 0)).toEqual({ subtotalCents: 14250, taxCents: 0, totalCents: 14250 });
  });

  it("applies a VAT rate to the subtotal, rounded", () => {
    expect(computeTotals([{ quantity: 1, unitPriceCents: 10000 }], 23))
      .toEqual({ subtotalCents: 10000, taxCents: 2300, totalCents: 12300 });
  });

  it("handles an empty invoice", () => {
    expect(computeTotals([], 20)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoice-totals.test.ts`
Expected: FAIL — `@/lib/invoices` not found.

- [ ] **Step 3: Create `lib/invoices.ts` with the types + `computeTotals`**

```ts
import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getClinicSettings } from "@/lib/settings";

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type InvoiceItemInput = {
  description: string; quantity: number; unitPriceCents: number;
  source?: string; appointmentId?: number; planId?: number;
};

export type InvoiceRow = {
  id: number; patient_id: number; number: string | null; status: InvoiceStatus;
  issue_date: string | null; due_date: string | null; currency: string;
  subtotal_cents: number; tax_rate: number | null; tax_cents: number; total_cents: number;
  notes: string | null; payment_link_url: string | null; paid_at: string | null; paid_method: string | null;
  created_by: number | null; created_at: string; updated_at: string;
};

export type InvoiceItemRow = {
  id: number; invoice_id: number; description: string; quantity: number;
  unit_price_cents: number; amount_cents: number; source: string | null;
  appointment_id: number | null; plan_id: number | null; sort: number;
};

export function computeTotals(
  items: { quantity: number; unitPriceCents: number }[],
  taxRate: number | null,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = items.reduce((sum, it) => sum + Math.round(it.quantity * it.unitPriceCents), 0);
  const rate = taxRate && taxRate > 0 ? taxRate : 0;
  const taxCents = Math.round((subtotalCents * rate) / 100);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
```

- [ ] **Step 4: Run test + commit**

```bash
npx vitest run test/invoice-totals.test.ts
git add lib/invoices.ts test/invoice-totals.test.ts
git commit -m "feat(3b): pure computeTotals for invoices

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Invoice CRUD + lifecycle

**Files:**
- Modify: `lib/invoices.ts` (append the functions)
- Test: `test/invoices.test.ts`

**Interfaces:**
- Consumes: `computeTotals`, `getClinicSettings`, `recordAudit`, `query`, `execute`.
- Produces:
  - `createInvoice(patientId: number, input: { items: InvoiceItemInput[]; dueDate?: string; notes?: string; createdBy?: number }): Promise<number>`
  - `getInvoice(id: number): Promise<{ invoice: InvoiceRow; items: InvoiceItemRow[] } | null>`
  - `listInvoicesForPatient(patientId: number): Promise<InvoiceRow[]>`
  - `listInvoices(filter?: { status?: InvoiceStatus }): Promise<(InvoiceRow & { patient_name: string | null })[]>`
  - `updateDraft(id: number, input: { items: InvoiceItemInput[]; dueDate?: string; notes?: string }): Promise<void>` (throws `"invoice not editable"` if not draft)
  - `finaliseInvoice(id: number, actorId?: number): Promise<string>` (returns the assigned number; throws `"invoice already finalised"` if not draft)
  - `markPaid(id: number, method: "stripe"|"manual", actorId?: number): Promise<void>`
  - `voidInvoice(id: number, actorId?: number): Promise<void>`
  - `setPaymentLink(id: number, url: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// test/invoices.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { saveInvoiceSettings } from "@/lib/settings";
import { listAuditForEntity } from "@/lib/audit";
import {
  createInvoice, getInvoice, listInvoicesForPatient, updateDraft,
  finaliseInvoice, markPaid, voidInvoice,
} from "@/lib/invoices";

describe("invoice lifecycle", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates a draft (no number), edits it, finalises with VAT + a sequential number, then marks paid", async () => {
    await saveInvoiceSettings({ currency: "EUR", vat_rate: 23, vat_number: "IEX", invoice_prefix: "T-" });
    const pid = await createPatient({ name: "Invoice P", dob: "1990-01-01" });

    const id = await createInvoice(pid, {
      items: [{ description: "Initial consultation", quantity: 1, unitPriceCents: 10000, source: "appointment" }],
      createdBy: 1,
    });
    let got = await getInvoice(id);
    expect(got?.invoice.status).toBe("draft");
    expect(got?.invoice.number).toBeNull();
    expect(got?.invoice.subtotal_cents).toBe(10000);
    expect(got?.invoice.tax_cents).toBe(0); // tax only at finalise
    expect(got?.items).toHaveLength(1);

    await updateDraft(id, { items: [
      { description: "Initial consultation", quantity: 1, unitPriceCents: 10000 },
      { description: "Follow-up", quantity: 2, unitPriceCents: 5000 },
    ], notes: "Thank you" });
    got = await getInvoice(id);
    expect(got?.invoice.subtotal_cents).toBe(20000);

    const number = await finaliseInvoice(id, 1);
    expect(number).toMatch(/^T-\d{4}$/);
    got = await getInvoice(id);
    expect(got?.invoice.status).toBe("sent");
    expect(got?.invoice.number).toBe(number);
    expect(got?.invoice.tax_rate).toBe(23);
    expect(got?.invoice.tax_cents).toBe(4600); // 23% of 20000
    expect(got?.invoice.total_cents).toBe(24600);
    expect(got?.invoice.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expect(updateDraft(id, { items: [] })).rejects.toThrow("invoice not editable");

    await markPaid(id, "manual", 1);
    got = await getInvoice(id);
    expect(got?.invoice.status).toBe("paid");
    expect(got?.invoice.paid_method).toBe("manual");

    const actions = (await listAuditForEntity("patient", pid)).map((a) => a.action);
    expect(actions).toContain("invoice_created");
    expect(actions).toContain("invoice_sent");
    expect(actions).toContain("invoice_paid");
  });

  it("assigns consecutive numbers and supports listing + void", async () => {
    await saveInvoiceSettings({ currency: "EUR", vat_rate: null, vat_number: null, invoice_prefix: "SEQ-" });
    const pid = await createPatient({ name: "Seq P", dob: "1990-01-01" });
    const a = await createInvoice(pid, { items: [{ description: "A", quantity: 1, unitPriceCents: 1000 }] });
    const b = await createInvoice(pid, { items: [{ description: "B", quantity: 1, unitPriceCents: 2000 }] });
    const na = await finaliseInvoice(a);
    const nb = await finaliseInvoice(b);
    const seqA = Number(na.slice(4));
    const seqB = Number(nb.slice(4));
    expect(seqB).toBe(seqA + 1);

    expect((await listInvoicesForPatient(pid)).length).toBeGreaterThanOrEqual(2);

    await voidInvoice(a, 1);
    expect((await getInvoice(a))?.invoice.status).toBe("void");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoices.test.ts`
Expected: FAIL — `createInvoice` etc. not exported.

- [ ] **Step 3: Append the functions to `lib/invoices.ts`**

```ts
async function writeItems(invoiceId: number, items: InvoiceItemInput[]): Promise<void> {
  await execute("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
  let sort = 0;
  for (const it of items) {
    const amount = Math.round(it.quantity * it.unitPriceCents);
    await execute(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, amount_cents, source, appointment_id, plan_id, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, it.description.trim(), it.quantity, it.unitPriceCents, amount, it.source ?? "free", it.appointmentId ?? null, it.planId ?? null, sort++],
    );
  }
}

export async function createInvoice(patientId: number, input: { items: InvoiceItemInput[]; dueDate?: string; notes?: string; createdBy?: number }): Promise<number> {
  const settings = await getClinicSettings();
  const totals = computeTotals(input.items, null); // tax is applied at finalise
  const rs = await execute(
    `INSERT INTO invoices (patient_id, status, currency, subtotal_cents, tax_rate, tax_cents, total_cents, due_date, notes, created_by)
     VALUES (?, 'draft', ?, ?, NULL, 0, ?, ?, ?, ?)`,
    [patientId, settings.currency || "EUR", totals.subtotalCents, totals.subtotalCents, (input.dueDate ?? "").trim() || null, (input.notes ?? "").trim() || null, input.createdBy ?? null],
  );
  const id = Number(rs.lastInsertRowid);
  await writeItems(id, input.items);
  await recordAudit({ actorId: input.createdBy, action: "invoice_created", entity: "patient", entityId: patientId, detail: `invoice ${id}` });
  return id;
}

export async function getInvoice(id: number): Promise<{ invoice: InvoiceRow; items: InvoiceItemRow[] } | null> {
  const invoice = (await query<InvoiceRow>("SELECT * FROM invoices WHERE id = ?", [id]))[0];
  if (!invoice) return null;
  const items = await query<InvoiceItemRow>("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort, id", [id]);
  return { invoice, items };
}

export async function listInvoicesForPatient(patientId: number): Promise<InvoiceRow[]> {
  return query<InvoiceRow>("SELECT * FROM invoices WHERE patient_id = ? ORDER BY id DESC", [patientId]);
}

export async function listInvoices(filter?: { status?: InvoiceStatus }): Promise<(InvoiceRow & { patient_name: string | null })[]> {
  if (filter?.status) {
    return query<InvoiceRow & { patient_name: string | null }>(
      "SELECT i.*, p.name AS patient_name FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id WHERE i.status = ? ORDER BY i.id DESC",
      [filter.status],
    );
  }
  return query<InvoiceRow & { patient_name: string | null }>(
    "SELECT i.*, p.name AS patient_name FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id ORDER BY i.id DESC",
  );
}

export async function updateDraft(id: number, input: { items: InvoiceItemInput[]; dueDate?: string; notes?: string }): Promise<void> {
  const inv = (await query<{ status: InvoiceStatus }>("SELECT status FROM invoices WHERE id = ?", [id]))[0];
  if (!inv) throw new Error("invoice not found");
  if (inv.status !== "draft") throw new Error("invoice not editable");
  const totals = computeTotals(input.items, null);
  await execute(
    "UPDATE invoices SET subtotal_cents = ?, total_cents = ?, due_date = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
    [totals.subtotalCents, totals.subtotalCents, (input.dueDate ?? "").trim() || null, (input.notes ?? "").trim() || null, id],
  );
  await writeItems(id, input.items);
}

export async function finaliseInvoice(id: number, actorId?: number): Promise<string> {
  const got = await getInvoice(id);
  if (!got) throw new Error("invoice not found");
  if (got.invoice.status !== "draft") throw new Error("invoice already finalised");
  const settings = await getClinicSettings();
  const seq = settings.invoice_next_seq ?? 1;
  const prefix = settings.invoice_prefix || "INV-";
  const number = `${prefix}${String(seq).padStart(4, "0")}`;
  const taxRate = settings.vat_rate && settings.vat_rate > 0 ? settings.vat_rate : null;
  const totals = computeTotals(got.items.map((it) => ({ quantity: it.quantity, unitPriceCents: it.unit_price_cents })), taxRate);
  const today = new Date().toISOString().slice(0, 10);
  await execute(
    `UPDATE invoices SET status = 'sent', number = ?, issue_date = ?, currency = ?, tax_rate = ?,
       subtotal_cents = ?, tax_cents = ?, total_cents = ?, updated_at = datetime('now') WHERE id = ?`,
    [number, today, settings.currency || "EUR", taxRate, totals.subtotalCents, totals.taxCents, totals.totalCents, id],
  );
  await execute("UPDATE clinic_settings SET invoice_next_seq = ? WHERE id = 1", [seq + 1]);
  await recordAudit({ actorId, action: "invoice_sent", entity: "patient", entityId: got.invoice.patient_id, detail: `invoice ${id} (${number})` });
  return number;
}

export async function markPaid(id: number, method: "stripe" | "manual", actorId?: number): Promise<void> {
  const inv = (await query<{ patient_id: number }>("SELECT patient_id FROM invoices WHERE id = ?", [id]))[0];
  if (!inv) throw new Error("invoice not found");
  await execute("UPDATE invoices SET status = 'paid', paid_at = datetime('now'), paid_method = ?, updated_at = datetime('now') WHERE id = ?", [method, id]);
  await recordAudit({ actorId, action: "invoice_paid", entity: "patient", entityId: inv.patient_id, detail: `invoice ${id} (${method})` });
}

export async function voidInvoice(id: number, actorId?: number): Promise<void> {
  const inv = (await query<{ patient_id: number }>("SELECT patient_id FROM invoices WHERE id = ?", [id]))[0];
  if (!inv) throw new Error("invoice not found");
  await execute("UPDATE invoices SET status = 'void', updated_at = datetime('now') WHERE id = ?", [id]);
  await recordAudit({ actorId, action: "invoice_voided", entity: "patient", entityId: inv.patient_id, detail: `invoice ${id}` });
}

export async function setPaymentLink(id: number, url: string): Promise<void> {
  await execute("UPDATE invoices SET payment_link_url = ?, updated_at = datetime('now') WHERE id = ?", [url, id]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/invoices.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
rm -f test.db && npm test
npx tsc --noEmit
git add lib/invoices.ts test/invoices.test.ts
git commit -m "feat(3b): invoice CRUD + lifecycle (draft/finalise/paid/void, sequential numbering)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: whole suite green, tsc exit 0.

---

## Self-Review

- **Spec coverage:** data model (invoices + items + settings columns) ✓; integer cents ✓; `computeTotals` pure + tested ✓; create/edit/finalise(number+VAT snapshot)/markPaid/void/setPaymentLink ✓; audit PII-free ✓; mock-safe (no keys) ✓. PDF/email/payments/UI/GDPR are later plans (3b-2/3/4).
- **Placeholder scan:** none.
- **Type consistency:** `InvoiceRow`/`InvoiceItemRow`/`InvoiceItemInput` used consistently; `getClinicSettings` returns the extended `ClinicSettings`; `finaliseInvoice` returns `string`; `saveClinicSettings` keeps `BaseClinicSettings`.
- **Known follow-ups:** the finalise read-then-increment of `invoice_next_seq` is fine for a solo tenant (tests run serial, one practitioner); a transaction/`RETURNING` is a possible later hardening.
