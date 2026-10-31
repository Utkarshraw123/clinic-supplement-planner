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
