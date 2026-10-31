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
