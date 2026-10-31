# Phase 3b-4 — Invoice UI + GDPR Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The practitioner-facing invoicing UI — list, create/edit-draft editor (free-form + appointment/plan/package prefills), finalise/pay-link/email/mark-paid/void actions, a patient-page Invoices card, and the clinic-settings invoicing fields — plus extending GDPR erasure + export to cover invoices.

**Architecture:** GDPR first (so the data model is complete), then server actions (`app/invoices/actions.ts`), then a client line-item editor (`components/InvoiceItemsEditor.tsx`), then the pages (`app/invoices/*`), the patient-page card, and the settings fields. The editor serialises line rows to a hidden JSON input; actions parse it, converting major-unit prices to cents.

**Tech Stack:** Next.js 14 (server components + server actions + one client component), `@libsql/client`, `vitest`, browser preview.

## Global Constraints

- **Depends on 3b-1/3b-2/3b-3** (`lib/invoices.ts`, `lib/invoice-pdf.tsx`, `lib/email.ts` `sendInvoiceEmail`, `lib/billing/payment-links.ts`, extended `lib/settings.ts`).
- Money in the UI is entered in **major units** (e.g. euros) and converted to **cents** in the action with `Math.round(x * 100)`.
- **Mock-safe:** pay link + email work with no keys; manual **Mark paid** always available.
- `stripe_secret_key` is **write-only** in the settings form (never rendered as a value).
- Mark-paid uses method `"manual"`. Void allowed on `draft`/`sent`, not on `paid`.
- Keep `npm test` green and `npx tsc --noEmit` clean; end commits with the Co-Authored-By line.

---

### Task 1: GDPR — erasure + export cover invoices

**Files:**
- Modify: `lib/patients.ts` (`deletePatient`)
- Modify: `lib/gdpr-export.ts`
- Test: `test/invoice-gdpr.test.ts`

**Interfaces:**
- `PatientExport` gains `invoices: { invoice: InvoiceRow; items: InvoiceItemRow[] }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// test/invoice-gdpr.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { createInvoice, finaliseInvoice, listInvoicesForPatient } from "@/lib/invoices";
import { exportPatientData } from "@/lib/gdpr-export";

describe("invoice GDPR", () => {
  beforeAll(async () => { await runMigrations(); });

  it("export includes invoices; erasure removes them", async () => {
    const pid = await createPatient({ name: "GDPR Inv", dob: "1990-01-01" });
    const id = await createInvoice(pid, { items: [{ description: "X", quantity: 1, unitPriceCents: 5000 }] });
    await finaliseInvoice(id);

    const exp = await exportPatientData(pid);
    expect(exp.invoices.length).toBe(1);
    expect(exp.invoices[0].items.length).toBe(1);

    await deletePatient(pid, 1);
    expect(await listInvoicesForPatient(pid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoice-gdpr.test.ts`
Expected: FAIL — `exp.invoices` is undefined.

- [ ] **Step 3: Extend `deletePatient` in `lib/patients.ts`**

In the `stmts` array, immediately **before** the line `stmts.push({ sql: `DELETE FROM portal_login_tokens WHERE patient_id = ?`, args: [id] });`, insert:

```ts
  const invIds = (await query<{ id: number }>("SELECT id FROM invoices WHERE patient_id = ?", [id])).map((r) => r.id);
  if (invIds.length) {
    const iph = invIds.map(() => "?").join(",");
    stmts.push({ sql: `DELETE FROM invoice_items WHERE invoice_id IN (${iph})`, args: invIds });
  }
  stmts.push({ sql: `DELETE FROM invoices WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 4: Extend `lib/gdpr-export.ts`**

Add the import near the top (after the other `@/lib` imports):

```ts
import { listInvoicesForPatient, getInvoice, type InvoiceRow, type InvoiceItemRow } from "@/lib/invoices";
```

Add to the `PatientExport` type (after the `plans: {...}[];` field):

```ts
  invoices: { invoice: InvoiceRow; items: InvoiceItemRow[] }[];
```

In the early `if (!patient)` return object, add `invoices: [],` (anywhere in the object literal).

Before the final `return { exported_at, patient, ... }`, build the invoices:

```ts
  const invoiceRows = await listInvoicesForPatient(patientId);
  const invoices: PatientExport["invoices"] = [];
  for (const inv of invoiceRows) {
    const g = await getInvoice(inv.id);
    if (g) invoices.push(g);
  }
```

And add `invoices` to the final return object:

```ts
  return { exported_at, patient, attributes, consents, notes, intake, appointments, plans, audit, invoices };
```

- [ ] **Step 5: Run test + full suite + commit**

```bash
npx vitest run test/invoice-gdpr.test.ts
rm -f test.db && npm test
npx tsc --noEmit
git add lib/patients.ts lib/gdpr-export.ts test/invoice-gdpr.test.ts
git commit -m "feat(3b): GDPR erasure + export cover invoices

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Server actions

**Files:**
- Create: `app/invoices/actions.ts`

**Interfaces:**
- Produces: `createInvoiceAction(formData)`, `saveDraftAction(id, formData)`, `finaliseAction(id, _formData?)`, `markPaidAction(id, _formData?)`, `voidAction(id, _formData?)`, `createPayLinkAction(id, _formData?)`, `emailInvoiceAction(id, _formData?)`.

- [ ] **Step 1: Create `app/invoices/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import {
  createInvoice, updateDraft, finaliseInvoice, markPaid, voidInvoice, getInvoice, setPaymentLink,
  type InvoiceItemInput,
} from "@/lib/invoices";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { createPaymentLink } from "@/lib/billing/payment-links";
import { sendInvoiceEmail } from "@/lib/email";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

function parseItems(raw: string): InvoiceItemInput[] {
  let arr: unknown = [];
  try { arr = JSON.parse(raw || "[]"); } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof (r as Record<string, unknown>).description === "string" && String((r as Record<string, unknown>).description).trim() !== "")
    .map((r) => ({
      description: String(r.description),
      quantity: Number(r.quantity) || 0,
      unitPriceCents: Math.round((Number(r.unitPrice) || 0) * 100),
      source: typeof r.source === "string" ? r.source : "free",
      appointmentId: r.appointmentId ? Number(r.appointmentId) : undefined,
      planId: r.planId ? Number(r.planId) : undefined,
    }));
}

export async function createInvoiceAction(formData: FormData) {
  const u = await requireUser();
  const patientId = Number(formData.get("patientId"));
  const id = await createInvoice(patientId, {
    items: parseItems(String(formData.get("items") || "[]")),
    dueDate: String(formData.get("dueDate") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
    createdBy: u.userId,
  });
  redirect(`/invoices/${id}`);
}

export async function saveDraftAction(id: number, formData: FormData) {
  await requireUser();
  await updateDraft(id, {
    items: parseItems(String(formData.get("items") || "[]")),
    dueDate: String(formData.get("dueDate") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
  });
  revalidatePath(`/invoices/${id}`);
}

export async function finaliseAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await finaliseInvoice(id, u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function markPaidAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await markPaid(id, "manual", u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function voidAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await voidInvoice(id, u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function createPayLinkAction(id: number, _formData?: FormData) {
  await requireUser();
  const got = await getInvoice(id);
  if (!got) return;
  const settings = await getClinicSettings();
  const { url } = await createPaymentLink({ invoice: got.invoice, key: settings.stripe_secret_key });
  await setPaymentLink(id, url);
  revalidatePath(`/invoices/${id}`);
}

export async function emailInvoiceAction(id: number, _formData?: FormData) {
  await requireUser();
  const got = await getInvoice(id);
  if (!got) return;
  const settings = await getClinicSettings();
  const patient = await getPatient(got.invoice.patient_id);
  if (!patient?.email) return;
  const pdf = await renderInvoicePdf(got.invoice, got.items, settings, patient.name);
  await sendInvoiceEmail({
    to: patient.email,
    from: settings.email_from || "",
    pdf,
    patientName: patient.name,
    number: got.invoice.number ?? String(got.invoice.id),
    payUrl: got.invoice.payment_link_url ?? undefined,
  });
  revalidatePath(`/invoices/${id}`);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/invoices/actions.ts
git commit -m "feat(3b): invoice server actions (create/save/finalise/pay-link/email/mark-paid/void)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Line-item editor (client component)

**Files:**
- Create: `components/InvoiceItemsEditor.tsx`

**Interfaces:**
- `InvoiceItemsEditor({ initialItems?, appointments?, plans?, vatRate?, currency? })` — renders editable rows, "Add line / package / from appointment / from plan", a live subtotal/VAT/total, and a hidden `items` JSON input for the enclosing `<form>`.

- [ ] **Step 1: Create `components/InvoiceItemsEditor.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";

type Row = { description: string; quantity: number; unitPrice: number; source: string; appointmentId?: number; planId?: number };
type ApptOpt = { id: number; label: string; price: number };
type PlanOpt = { id: number; label: string };

export default function InvoiceItemsEditor({
  initialItems = [], appointments = [], plans = [], vatRate = null, currency = "EUR",
}: { initialItems?: Row[]; appointments?: ApptOpt[]; plans?: PlanOpt[]; vatRate?: number | null; currency?: string }) {
  const [rows, setRows] = useState<Row[]>(
    initialItems.length ? initialItems : [{ description: "", quantity: 1, unitPrice: 0, source: "free" }]
  );

  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€";
  const lineCents = (r: Row) => Math.round((r.quantity || 0) * Math.round((r.unitPrice || 0) * 100));
  const subtotal = rows.reduce((s, r) => s + lineCents(r), 0);
  const rate = vatRate && vatRate > 0 ? vatRate : 0;
  const tax = Math.round((subtotal * rate) / 100);
  const total = subtotal + tax;
  const money = (c: number) => `${sym}${(c / 100).toFixed(2)}`;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = (row: Row) => setRows((rs) => [...rs, row]);

  const itemsJson = useMemo(() => JSON.stringify(rows.filter((r) => r.description.trim() !== "")), [rows]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="items" value={itemsJson} />
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: "center" }}>
          <input style={{ flex: 1 }} placeholder="Description" value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
          <input style={{ width: 64 }} type="number" step="0.5" min="0" value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <input style={{ width: 96 }} type="number" step="0.01" min="0" value={r.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} />
          <span className="muted-xs" style={{ width: 84, textAlign: "right" }}>{money(lineCents(r))}</span>
          <button type="button" className="btn" onClick={() => remove(i)}>×</button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => add({ description: "", quantity: 1, unitPrice: 0, source: "free" })}>+ Add line</button>
        <button type="button" className="btn" onClick={() => add({ description: "Package", quantity: 1, unitPrice: 0, source: "package" })}>+ Add package</button>
        {appointments.length ? (
          <select defaultValue="" onChange={(e) => { const a = appointments.find((x) => String(x.id) === e.target.value); if (a) add({ description: a.label, quantity: 1, unitPrice: a.price, source: "appointment", appointmentId: a.id }); e.currentTarget.value = ""; }}>
            <option value="">+ From appointment…</option>
            {appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        ) : null}
        {plans.length ? (
          <select defaultValue="" onChange={(e) => { const p = plans.find((x) => String(x.id) === e.target.value); if (p) add({ description: p.label, quantity: 1, unitPrice: 0, source: "plan", planId: p.id }); e.currentTarget.value = ""; }}>
            <option value="">+ From plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        ) : null}
      </div>

      <div className="stack" style={{ gap: 2, marginLeft: "auto", width: 220 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Subtotal</span><span>{money(subtotal)}</span></div>
        {tax > 0 ? <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">VAT {rate}%</span><span>{money(tax)}</span></div> : null}
        <div className="row" style={{ justifyContent: "space-between", fontWeight: 700 }}><span>Total</span><span>{money(total)}</span></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/InvoiceItemsEditor.tsx
git commit -m "feat(3b): invoice line-item editor (free/appointment/plan/package, live totals)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Invoice pages + nav link

**Files:**
- Create: `app/invoices/page.tsx` (list)
- Create: `app/invoices/new/page.tsx`
- Create: `app/invoices/[id]/page.tsx`
- Modify: `components/AppShell.tsx` (nav link)

- [ ] **Step 1: Create the list page `app/invoices/page.tsx`**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listInvoices, type InvoiceStatus } from "@/lib/invoices";

function money(cents: number, currency: string) { const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€"; return `${sym}${(cents / 100).toFixed(2)}`; }

export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireUser();
  const status = (searchParams.status as InvoiceStatus | undefined);
  const invoices = await listInvoices(status ? { status } : undefined);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h1>Invoices</h1>
        <Link href="/invoices/new" className="btn--primary">+ New invoice</Link>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {["all", "draft", "sent", "paid", "void"].map((s) => (
          <Link key={s} href={s === "all" ? "/invoices" : `/invoices?status=${s}`} className="btn--sm">{s}</Link>
        ))}
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {invoices.length === 0 ? <p className="muted">No invoices.</p> : invoices.map((i) => (
          <Link key={i.id} href={`/invoices/${i.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{i.number ?? "(draft)"} · {i.patient_name ?? "—"}</span>
            <span>{money(i.total_cents, i.currency)} · <strong>{i.status}</strong></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/invoices/new/page.tsx`**

```tsx
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import { getClinicSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import InvoiceItemsEditor from "@/components/InvoiceItemsEditor";
import { createInvoiceAction } from "../actions";

function parsePrice(p: string | null): number { if (!p) return 0; const m = String(p).replace(/[^0-9.]/g, ""); return m ? Math.round(parseFloat(m) * 100) / 100 : 0; }

export default async function NewInvoicePage({ searchParams }: { searchParams: { patientId?: string } }) {
  await requireUser();
  const settings = await getClinicSettings();
  const patients = await listPatients();
  const presetId = searchParams.patientId ? Number(searchParams.patientId) : null;

  let appts: { id: number; label: string; price: number }[] = [];
  let plans: { id: number; label: string }[] = [];
  if (presetId) {
    const a = await query<{ id: number; starts_at: string; type_name: string | null; price: string | null }>(
      `SELECT ap.id, ap.starts_at, t.name AS type_name, t.price
         FROM appointments ap LEFT JOIN appointment_types t ON t.id = ap.appointment_type_id
        WHERE ap.patient_id = ? ORDER BY ap.starts_at DESC`,
      [presetId]
    );
    appts = a.map((x) => ({ id: x.id, label: `${x.type_name ?? "Appointment"} — ${new Date(x.starts_at).toLocaleDateString()}`, price: parsePrice(x.price) }));
    const pr = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'finalised' ORDER BY id DESC", [presetId]);
    plans = pr.map((p) => ({ id: p.id, label: `Supplement plan #${p.id}` }));
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <h1>New invoice</h1>
      <form action={createInvoiceAction} className="card stack" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 5 }}><span>Patient</span>
          <select name="patientId" defaultValue={presetId ?? ""} required>
            <option value="" disabled>Choose a patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <InvoiceItemsEditor appointments={appts} plans={plans} vatRate={settings.vat_rate} currency={settings.currency || "EUR"} />
        <label className="stack" style={{ gap: 5 }}><span>Due date <span className="muted-xs">(optional)</span></span><input name="dueDate" type="date" /></label>
        <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="notes" rows={2} /></label>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create draft</button>
      </form>
      <p className="muted-xs">Appointment &amp; plan prefills appear when you open this from a patient&apos;s page.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/invoices/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getInvoice } from "@/lib/invoices";
import { getPatient } from "@/lib/patients";
import { getClinicSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import InvoiceItemsEditor from "@/components/InvoiceItemsEditor";
import { saveDraftAction, finaliseAction, markPaidAction, voidAction, createPayLinkAction, emailInvoiceAction } from "../actions";

function money(cents: number, currency: string) { const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€"; return `${sym}${(cents / 100).toFixed(2)}`; }
function parsePrice(p: string | null): number { if (!p) return 0; const m = String(p).replace(/[^0-9.]/g, ""); return m ? Math.round(parseFloat(m) * 100) / 100 : 0; }

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const got = await getInvoice(id);
  if (!got) notFound();
  const { invoice, items } = got;
  const settings = await getClinicSettings();
  const patient = await getPatient(invoice.patient_id);
  const cur = invoice.currency || "EUR";

  if (invoice.status === "draft") {
    const a = await query<{ id: number; starts_at: string; type_name: string | null; price: string | null }>(
      `SELECT ap.id, ap.starts_at, t.name AS type_name, t.price
         FROM appointments ap LEFT JOIN appointment_types t ON t.id = ap.appointment_type_id
        WHERE ap.patient_id = ? ORDER BY ap.starts_at DESC`,
      [invoice.patient_id]
    );
    const appts = a.map((x) => ({ id: x.id, label: `${x.type_name ?? "Appointment"} — ${new Date(x.starts_at).toLocaleDateString()}`, price: parsePrice(x.price) }));
    const pr = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'finalised' ORDER BY id DESC", [invoice.patient_id]);
    const plans = pr.map((p) => ({ id: p.id, label: `Supplement plan #${p.id}` }));
    const initial = items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unit_price_cents / 100, source: it.source ?? "free", appointmentId: it.appointment_id ?? undefined, planId: it.plan_id ?? undefined }));

    return (
      <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
        <div className="row-between"><h1>Draft invoice</h1><Link href={`/patients/${invoice.patient_id}`} className="btn--sm">{patient?.name}</Link></div>
        <form action={saveDraftAction.bind(null, id)} className="card stack" style={{ gap: 12 }}>
          <InvoiceItemsEditor initialItems={initial} appointments={appts} plans={plans} vatRate={settings.vat_rate} currency={cur} />
          <label className="stack" style={{ gap: 5 }}><span>Due date</span><input name="dueDate" type="date" defaultValue={invoice.due_date ?? ""} /></label>
          <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="notes" rows={2} defaultValue={invoice.notes ?? ""} /></label>
          <button type="submit" className="btn">Save draft</button>
        </form>
        <form action={finaliseAction.bind(null, id)}><button type="submit" className="btn--primary">Finalise invoice</button></form>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <div className="row-between">
        <div><h1>{invoice.number}</h1><p className="muted">{patient?.name} · <strong>{invoice.status}</strong></p></div>
        <Link href={`/api/invoices/${id}/pdf`} target="_blank" className="btn--sm">Download PDF</Link>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {items.map((it) => (
          <div key={it.id} className="row" style={{ justifyContent: "space-between" }}><span>{it.description} × {it.quantity}</span><span>{money(it.amount_cents, cur)}</span></div>
        ))}
        <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}><span className="muted">Subtotal</span><span>{money(invoice.subtotal_cents, cur)}</span></div>
        {invoice.tax_cents > 0 ? <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">VAT {invoice.tax_rate}%</span><span>{money(invoice.tax_cents, cur)}</span></div> : null}
        <div className="row" style={{ justifyContent: "space-between", fontWeight: 700 }}><span>Total</span><span>{money(invoice.total_cents, cur)}</span></div>
        {invoice.payment_link_url ? <p className="muted-xs">Pay link: {invoice.payment_link_url}</p> : null}
      </div>
      {invoice.status !== "void" ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {!invoice.payment_link_url ? <form action={createPayLinkAction.bind(null, id)}><button type="submit" className="btn">Create pay link</button></form> : null}
          {patient?.email ? <form action={emailInvoiceAction.bind(null, id)}><button type="submit" className="btn">Email to patient</button></form> : null}
          {invoice.status !== "paid" ? <form action={markPaidAction.bind(null, id)}><button type="submit" className="btn--primary">Mark paid</button></form> : null}
          {invoice.status !== "paid" ? <form action={voidAction.bind(null, id)}><button type="submit" className="btn">Void</button></form> : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link in `components/AppShell.tsx`**

Immediately after the line `{ href: "/appointments", label: "Appointments", icon: "calendar" },`, add:

```ts
    { href: "/invoices", label: "Invoices", icon: "note" },
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/invoices/page.tsx" "app/invoices/new/page.tsx" "app/invoices/[id]/page.tsx" components/AppShell.tsx
git commit -m "feat(3b): invoice list, new + draft editor, detail/actions, nav link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Patient-page Invoices card

**Files:**
- Modify: `app/patients/[id]/page.tsx`

- [ ] **Step 1: Add the import**

After `import { listNotesForPatient } from "@/lib/consultation-notes";`, add:

```ts
import { listInvoicesForPatient } from "@/lib/invoices";
```

- [ ] **Step 2: Load the invoices**

After the line `const appts = await listAppointmentsForPatient(id);`, add:

```ts
  const invoices = await listInvoicesForPatient(id);
```

- [ ] **Step 3: Render the card**

Immediately **before** the line `<div className="card">` that contains `<h2 style={{ marginBottom: 2 }}>Clinical profile</h2>`, insert:

```tsx
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Invoices</h2>
          <Link href={`/invoices/new?patientId=${id}`} className="btn--primary">+ New invoice</Link>
        </div>
        {invoices.length === 0 ? <p className="muted">No invoices.</p> : invoices.map((i) => {
          const sym = i.currency === "GBP" ? "£" : i.currency === "USD" ? "$" : "€";
          return (
            <Link key={i.id} href={`/invoices/${i.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
              <span>{i.number ?? "(draft)"}</span>
              <span>{sym}{(i.total_cents / 100).toFixed(2)} · <strong>{i.status}</strong></span>
            </Link>
          );
        })}
      </div>
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/patients/[id]/page.tsx"
git commit -m "feat(3b): Invoices card on the patient page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Clinic-settings invoicing fields

**Files:**
- Modify: `app/admin/settings/actions.ts`
- Modify: `app/admin/settings/page.tsx`

- [ ] **Step 1: Extend `app/admin/settings/actions.ts`**

Replace the file with:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { saveClinicSettings, saveInvoiceSettings, setStripeSecretKey } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveClinicSettings({
    clinic_name: String(formData.get("clinic_name") || "") || null,
    logo_url: String(formData.get("logo_url") || "") || null,
    address: String(formData.get("address") || "") || null,
    contact: String(formData.get("contact") || "") || null,
    email_from: String(formData.get("email_from") || "") || null,
    letterhead_template: String(formData.get("letterhead_template") || "") || null,
  });
  const vatRaw = String(formData.get("vat_rate") || "").trim();
  await saveInvoiceSettings({
    currency: String(formData.get("currency") || "") || "EUR",
    vat_rate: vatRaw === "" ? null : Number(vatRaw),
    vat_number: String(formData.get("vat_number") || "") || null,
    invoice_prefix: String(formData.get("invoice_prefix") || "") || "INV-",
  });
  const key = String(formData.get("stripe_secret_key") || "").trim();
  if (key) await setStripeSecretKey(key);
  revalidatePath("/admin/settings");
}
```

- [ ] **Step 2: Add the fields to `app/admin/settings/page.tsx`**

Immediately **before** the final `<button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save settings</button>` line, insert:

```tsx
          <div className="stack" style={{ gap: 10, marginTop: 8, borderTop: "1px solid var(--border,#eee)", paddingTop: 12 }}>
            <span style={{ fontWeight: 600 }}>Invoicing</span>
            <div className="row" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>Currency</span>
                <select name="currency" defaultValue={s.currency ?? "EUR"}>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </label>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>Invoice prefix</span><input name="invoice_prefix" defaultValue={s.invoice_prefix ?? "INV-"} /></label>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>VAT rate % <span className="muted-xs">(blank = not registered)</span></span><input name="vat_rate" type="number" step="0.1" min="0" defaultValue={s.vat_rate ?? ""} /></label>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>VAT number</span><input name="vat_number" defaultValue={s.vat_number ?? ""} /></label>
            </div>
            <label className="stack" style={{ gap: 5 }}><span>Stripe secret key <span className="muted-xs">{s.stripe_secret_key ? "(set — leave blank to keep)" : "(optional, test key)"}</span></span><input name="stripe_secret_key" type="password" placeholder={s.stripe_secret_key ? "••••••••" : "sk_test_…"} /></label>
          </div>
```

- [ ] **Step 3: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
rm -f test.db && npm test
git add app/admin/settings/actions.ts app/admin/settings/page.tsx
git commit -m "feat(3b): clinic-settings invoicing fields (currency, VAT, prefix, Stripe key)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Browser smoke (mock mode)

**No code.** Verify the end-to-end flow in the preview pane.

- [ ] **Step 1: Migrate + start**

```bash
npm run migrate:all
```
Then start the dev server (preview name `supplement-db-dev`, port 3200) and sign in as `lorna@clinic.test` / `lorna123`.

- [ ] **Step 2: Walk the flow**

1. Admin → Settings → set Currency EUR, VAT rate 23, VAT number, prefix (e.g. `LDN-`); Save.
2. Open a patient → **Invoices** card → **New invoice** (patient prefilled).
3. Add a line from the appointment dropdown (if the patient has one), add a free line, optionally **Add package**; confirm the live subtotal/VAT/total update → **Create draft**.
4. On the draft, **Save draft** persists edits; **Finalise invoice** assigns a `LDN-0001` number and shows VAT.
5. **Download PDF** opens a branded PDF with the line table + VAT + total.
6. **Create pay link** stores a `pay.mock/...` URL (no Stripe key); **Email to patient** returns a mock (patient needs an email set); **Mark paid** flips the status badge to `paid`.
7. `/invoices` lists it; the status filter works; a draft can be **Void**ed.
8. Check `preview_logs` (level error) → no server errors. Stop the server.

- [ ] **Step 3: Final commit (if any smoke fixes were needed)**

```bash
git add -A && git commit -m "fix(3b): invoicing browser-smoke fixes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** practitioner-only UI (list + editor + detail) ✓; free-form + appointment/plan/package prefills ✓; finalise/pay-link/email/mark-paid/void ✓; patient-page Invoices card ✓; settings fields incl. write-only Stripe key ✓; GDPR erasure + export cover invoices ✓; mock-safe throughout ✓; no patient-portal invoice view (per decision) ✓.
- **Placeholder scan:** none.
- **Type consistency:** actions consume `createInvoice`/`updateDraft`/`finaliseInvoice`/`markPaid`/`voidInvoice`/`getInvoice`/`setPaymentLink` (3b-1), `createPaymentLink` (3b-3), `renderInvoicePdf` (3b-2), `sendInvoiceEmail` (3b-2); the editor's `Row` (`unitPrice` in major units) is converted to `unitPriceCents` in `parseItems`; `InvoiceItemsEditor` props match both page call-sites; `.bind(null, id)` matches each action's `(id, _formData?)` shape.
- **Known follow-ups:** the invoice-detail draft editor re-queries appointments/plans (acceptable); webhook auto-reconcile and portal invoice view remain deferred non-goals.
