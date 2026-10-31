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
