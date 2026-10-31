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
