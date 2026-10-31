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
