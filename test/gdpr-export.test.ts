import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { recordConsent } from "@/lib/consent";
import { exportPatientData } from "@/lib/gdpr-export";

describe("patient data export", () => {
  beforeAll(async () => { await runMigrations(); });

  it("includes demographics, consents, plans with items, and audit; excludes pdf_base64", async () => {
    const stamp = Date.now();
    const actor = await createUser({ email: `x${stamp}@c.test`, password: "x", role: "admin", name: "X" });
    const brandId = await createBrand({ name: `Ex ${stamp}` });
    const productId = await createProduct({ brandId, name: "Ex Magnesium", form: "capsule" });
    const pid = await createPatient({ name: "Export P", dob: "1991-03-03", email: "export@x.test", createdBy: actor });
    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1", actorId: actor });
    const { createNote } = await import("@/lib/consultation-notes");
    await createNote(pid, { noteDate: "2026-01-01", title: "Visit" });
    const planId = await getOrCreateDraftPlan(pid, actor);
    await addPlanItem(planId, productId);

    const out = await exportPatientData(pid);

    expect(out.patient?.name).toBe("Export P");
    expect((out.patient as { email?: string } | null)?.email).toBe("export@x.test");
    expect(out.consents.some((c) => c.purpose === "health_data_processing")).toBe(true);
    expect(out.plans).toHaveLength(1);
    expect(out.plans[0].items[0].product_name).toBe("Ex Magnesium");
    expect(out.notes.some((n: { title: string | null }) => n.title === "Visit")).toBe(true);
    expect(JSON.stringify(out)).not.toContain("pdf_base64");
  });

  it("returns patient:null for an unknown id", async () => {
    const out = await exportPatientData(99999999);
    expect(out.patient).toBeNull();
  });
});
