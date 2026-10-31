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
