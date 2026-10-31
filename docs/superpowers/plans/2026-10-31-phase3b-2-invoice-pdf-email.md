# Phase 3b-2 — Invoice PDF + Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A branded invoice PDF (react-pdf, Merriweather), an authed PDF download route, and a mock-safe email that sends the PDF + pay link to the patient.

**Architecture:** `lib/invoice-pdf.tsx` renders an `InvoiceRow` + its items + `ClinicSettings` to a PDF `Buffer` using the same embedded Merriweather font as the plan PDF. `app/api/invoices/[id]/pdf/route.ts` streams it to the practitioner. `sendInvoiceEmail` is added to `lib/email.ts`, mirroring the existing mock-safe `sendPlanEmail`.

**Tech Stack:** `@react-pdf/renderer`, Next.js route handler, Resend (mock-safe), `vitest`.

## Global Constraints

- **Depends on 3b-1** (`lib/invoices.ts`, extended `lib/settings.ts`).
- **Mock-safe:** no `RESEND_API_KEY` → email is a logged mock, returns `{ mocked: true }`.
- Money renders from integer cents: `(cents/100).toFixed(2)` with the invoice's currency symbol.
- Keep `npm test` green and `npx tsc --noEmit` clean.

---

### Task 1: Invoice PDF

**Files:**
- Create: `lib/invoice-pdf.tsx`
- Test: `test/invoice-pdf.test.ts`

**Interfaces:**
- Consumes: `InvoiceRow`, `InvoiceItemRow` (`@/lib/invoices`); `ClinicSettings` (`@/lib/settings`); `MERRIWEATHER_REGULAR`, `MERRIWEATHER_BOLD` (`@/lib/pdf-fonts`).
- Produces: `renderInvoicePdf(invoice: InvoiceRow, items: InvoiceItemRow[], settings: ClinicSettings, patientName: string): Promise<Buffer>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/invoice-pdf.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { saveInvoiceSettings, getClinicSettings } from "@/lib/settings";
import { createInvoice, finaliseInvoice, getInvoice } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

describe("renderInvoicePdf", () => {
  beforeAll(async () => { await runMigrations(); });

  it("renders a finalised invoice to a PDF buffer", async () => {
    await saveInvoiceSettings({ currency: "EUR", vat_rate: 23, vat_number: "IE123", invoice_prefix: "PDF-" });
    const pid = await createPatient({ name: "PDF Patient", dob: "1990-01-01" });
    const id = await createInvoice(pid, { items: [{ description: "Initial consultation", quantity: 1, unitPriceCents: 7500 }] });
    await finaliseInvoice(id);
    const got = await getInvoice(id);
    const settings = await getClinicSettings();
    const pdf = await renderInvoicePdf(got!.invoice, got!.items, settings, "PDF Patient");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoice-pdf.test.ts`
Expected: FAIL — `@/lib/invoice-pdf` not found.

- [ ] **Step 3: Create `lib/invoice-pdf.tsx`**

```tsx
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { MERRIWEATHER_REGULAR, MERRIWEATHER_BOLD } from "@/lib/pdf-fonts";
import type { InvoiceRow, InvoiceItemRow } from "@/lib/invoices";
import type { ClinicSettings } from "@/lib/settings";

Font.register({ family: "Merriweather", fonts: [{ src: MERRIWEATHER_REGULAR }, { src: MERRIWEATHER_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback((word) => [word]);

const INK = "#2C2C2A";
const MUTED = "#6B6B63";
const GOLD = "#A17C3A";

function money(cents: number, currency: string): string {
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

const st = StyleSheet.create({
  page: { fontFamily: "Merriweather", fontSize: 10, color: INK, padding: 48, lineHeight: 1.5 },
  h1: { fontSize: 18, fontWeight: 700, color: GOLD },
  row: { flexDirection: "row", justifyContent: "space-between" },
  right: { textAlign: "right" },
  muted: { color: MUTED },
  section: { marginTop: 18 },
  th: { flexDirection: "row", borderBottom: `1px solid ${GOLD}`, paddingBottom: 4, marginTop: 14, fontWeight: 700 },
  td: { flexDirection: "row", borderBottom: "1px solid #eeeeee", paddingTop: 5, paddingBottom: 5 },
  cDesc: { flex: 1 },
  cQty: { width: 44, textAlign: "right" },
  cUnit: { width: 76, textAlign: "right" },
  cAmt: { width: 76, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: 240 },
  trow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2, paddingBottom: 2 },
  grand: { fontWeight: 700, fontSize: 12, borderTop: `1px solid ${GOLD}`, marginTop: 4, paddingTop: 4 },
});

export function InvoiceDoc({ invoice, items, settings, patientName }: { invoice: InvoiceRow; items: InvoiceItemRow[]; settings: ClinicSettings; patientName: string }) {
  const cur = invoice.currency || "EUR";
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <View style={st.row}>
          <View>
            <Text style={st.h1}>{settings.clinic_name || "Invoice"}</Text>
            {settings.address ? <Text style={st.muted}>{settings.address}</Text> : null}
            {settings.contact ? <Text style={st.muted}>{settings.contact}</Text> : null}
            {settings.vat_number ? <Text style={st.muted}>VAT {settings.vat_number}</Text> : null}
          </View>
          <View style={st.right}>
            <Text style={{ fontWeight: 700, fontSize: 13 }}>INVOICE</Text>
            <Text style={st.muted}>{invoice.number ?? "(draft)"}</Text>
            {invoice.issue_date ? <Text style={st.muted}>Issued {invoice.issue_date}</Text> : null}
            {invoice.due_date ? <Text style={st.muted}>Due {invoice.due_date}</Text> : null}
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.muted}>Bill to</Text>
          <Text>{patientName}</Text>
        </View>

        <View style={st.th}>
          <Text style={st.cDesc}>Description</Text>
          <Text style={st.cQty}>Qty</Text>
          <Text style={st.cUnit}>Unit</Text>
          <Text style={st.cAmt}>Amount</Text>
        </View>
        {items.map((it) => (
          <View key={it.id} style={st.td}>
            <Text style={st.cDesc}>{it.description}</Text>
            <Text style={st.cQty}>{it.quantity}</Text>
            <Text style={st.cUnit}>{money(it.unit_price_cents, cur)}</Text>
            <Text style={st.cAmt}>{money(it.amount_cents, cur)}</Text>
          </View>
        ))}

        <View style={st.totals}>
          <View style={st.trow}><Text>Subtotal</Text><Text>{money(invoice.subtotal_cents, cur)}</Text></View>
          {invoice.tax_cents > 0 ? (
            <View style={st.trow}><Text>VAT {invoice.tax_rate ?? 0}%</Text><Text>{money(invoice.tax_cents, cur)}</Text></View>
          ) : null}
          <View style={[st.trow, st.grand]}><Text>Total</Text><Text>{money(invoice.total_cents, cur)}</Text></View>
        </View>

        {invoice.notes ? <View style={st.section}><Text style={st.muted}>Notes</Text><Text>{invoice.notes}</Text></View> : null}
        {invoice.payment_link_url ? <View style={st.section}><Text style={st.muted}>Pay online</Text><Text>{invoice.payment_link_url}</Text></View> : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceRow, items: InvoiceItemRow[], settings: ClinicSettings, patientName: string): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc invoice={invoice} items={items} settings={settings} patientName={patientName} />);
}
```

- [ ] **Step 4: Run test + commit**

```bash
npx vitest run test/invoice-pdf.test.ts
git add lib/invoice-pdf.tsx test/invoice-pdf.test.ts
git commit -m "feat(3b): branded invoice PDF (react-pdf, Merriweather)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: PDF download route

**Files:**
- Create: `app/api/invoices/[id]/pdf/route.ts`

**Interfaces:**
- `GET /api/invoices/[id]/pdf` → authed (`requireUser`) → `application/pdf` (404 if the invoice is missing).

- [ ] **Step 1: Create the route**

```ts
// app/api/invoices/[id]/pdf/route.ts
import { requireUser } from "@/lib/auth/current-user";
import { getInvoice } from "@/lib/invoices";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const got = await getInvoice(Number(params.id));
  if (!got) return new Response("not found", { status: 404 });
  const settings = await getClinicSettings();
  const patient = await getPatient(got.invoice.patient_id);
  const pdf = await renderInvoicePdf(got.invoice, got.items, settings, patient?.name ?? "Patient");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${got.invoice.number ?? got.invoice.id}.pdf"`,
    },
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/api/invoices/[id]/pdf/route.ts"
git commit -m "feat(3b): authed invoice PDF download route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Invoice email (mock-safe)

**Files:**
- Modify: `lib/email.ts` (add `sendInvoiceEmail`)
- Test: `test/invoice-email.test.ts`

**Interfaces:**
- Produces: `sendInvoiceEmail(input: { to: string; from: string; pdf: Buffer; patientName: string; number: string; payUrl?: string }): Promise<{ mocked: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/invoice-email.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { sendInvoiceEmail } from "@/lib/email";

describe("sendInvoiceEmail", () => {
  beforeAll(() => { delete process.env.RESEND_API_KEY; });
  it("is mock-safe with no key", async () => {
    const res = await sendInvoiceEmail({ to: "p@example.test", from: "clinic@example.test", pdf: Buffer.from("%PDF-1.4 x"), patientName: "Pat", number: "INV-0001", payUrl: "https://pay.mock/x" });
    expect(res.mocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invoice-email.test.ts`
Expected: FAIL — `sendInvoiceEmail` not exported.

- [ ] **Step 3: Append `sendInvoiceEmail` to `lib/email.ts`**

```ts
export async function sendInvoiceEmail(input: { to: string; from: string; pdf: Buffer; patientName: string; number: string; payUrl?: string }): Promise<{ mocked: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] would send invoice ${input.number} to ${input.to} (${input.pdf.length} bytes)${input.payUrl ? ` pay: ${input.payUrl}` : ""}`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "invoices@example.com",
    to: input.to,
    subject: `Invoice ${input.number}`,
    text: `Dear ${input.patientName},\n\nPlease find invoice ${input.number} attached.${input.payUrl ? `\n\nPay online: ${input.payUrl}` : ""}\n\nThank you.`,
    attachments: [{ filename: `invoice-${input.number}.pdf`, content: input.pdf.toString("base64") }],
  });
  return { mocked: false };
}
```

- [ ] **Step 4: Run test + full suite + commit**

```bash
npx vitest run test/invoice-email.test.ts
rm -f test.db && npm test
git add lib/email.ts test/invoice-email.test.ts
git commit -m "feat(3b): mock-safe invoice email (PDF + pay link)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** branded PDF reusing pdf-fonts ✓; download route (authed) ✓; email delivery mock-safe ✓. Shows clinic letterhead, number/dates, bill-to, line table, subtotal/VAT/total, notes, pay link.
- **Placeholder scan:** none.
- **Type consistency:** `renderInvoicePdf(invoice, items, settings, patientName)` signature matches both the route and the test; `sendInvoiceEmail` shape matches the action in 3b-4.
- **Known follow-ups:** the route has no unit test (covered by the PDF render test + a tsc gate + the 3b-4 browser smoke).
