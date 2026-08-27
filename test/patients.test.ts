import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { recordAudit } from "@/lib/audit";
import { query, execute } from "@/lib/db";
import * as Pt from "@/lib/patients";

describe("patients", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates a patient and replaces attributes", async () => {
    const id = await Pt.createPatient({ name: "Emma Hartley", dob: "1988-03-14" });
    const mushroom = await addTerm("allergen", "mushroom");
    const energy = await addTerm("concern", "energy");
    await Pt.setPatientAttributes(id, [
      { termId: mushroom, attrType: "allergy" },
      { termId: energy, attrType: "goal" },
    ]);
    let detail = await Pt.getPatient(id);
    expect(detail!.name).toBe("Emma Hartley");
    expect(detail!.attributes.map((a) => a.attrType).sort()).toEqual(["allergy","goal"]);

    await Pt.setPatientAttributes(id, [{ termId: energy, attrType: "goal" }]);
    detail = await Pt.getPatient(id);
    expect(detail!.attributes).toHaveLength(1);
  });

  it("erases a patient and ALL linked data (GDPR right-to-erasure)", async () => {
    const brandId = await createBrand({ name: `DEL ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Del Product", form: "capsule" });
    const patientId = await Pt.createPatient({ name: "Erase Me", dob: "1990-01-01" });
    const term = await addTerm("allergen", `del-allergen-${Date.now()}`);
    await Pt.setPatientAttributes(patientId, [{ termId: term, attrType: "allergy" }]);
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);
    await execute("INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64, sent_to_email) VALUES (?, '{}', '', ?)", [planId, "client@example.com"]);
    await execute("INSERT INTO plan_guide (plan_id) VALUES (?)", [planId]);
    await recordAudit({ action: "sent", entity: "plan", entityId: planId, detail: "→ client@example.com" });

    await Pt.deletePatient(patientId);

    const gone = async (sql: string, args: number[]) => (await query(sql, args)).length === 0;
    expect(await gone("SELECT id FROM patients WHERE id = ?", [patientId])).toBe(true);
    expect(await gone("SELECT patient_id FROM patient_attributes WHERE patient_id = ?", [patientId])).toBe(true);
    expect(await gone("SELECT id FROM plans WHERE patient_id = ?", [patientId])).toBe(true);
    expect(await gone("SELECT id FROM plan_items WHERE plan_id = ?", [planId])).toBe(true);
    expect(await gone("SELECT id FROM plan_snapshots WHERE plan_id = ?", [planId])).toBe(true);
    expect(await gone("SELECT plan_id FROM plan_guide WHERE plan_id = ?", [planId])).toBe(true);
    expect(await gone("SELECT id FROM audit_events WHERE entity = 'plan' AND entity_id = ?", [planId])).toBe(true);
  });
});
