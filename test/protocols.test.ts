import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, setItemDosing, getPlan } from "@/lib/plans";
import { execute } from "@/lib/db";
import { savePlanAsProtocol, listProtocols, getProtocol, applyProtocolToPlan } from "@/lib/protocols";

describe("protocols", () => {
  let productA = 0, productB = 0, presetId = 0, patientId = 0;
  beforeAll(async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `Proto ${Date.now()}` });
    productA = await createProduct({ brandId, name: "Proto Magnesium", form: "capsule" });
    productB = await createProduct({ brandId, name: "Proto Vitamin D", form: "capsule" });
    const rs = await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", ["proto-morning", "Take 1 in the morning."]);
    presetId = Number(rs.lastInsertRowid);
    patientId = await createPatient({ name: "Proto Patient", dob: "1990-01-01" });
  });

  it("saves a plan as a protocol, then applies it to a fresh plan with dosing preserved", async () => {
    // Build a source plan with two dosed items.
    const srcPatient = await createPatient({ name: "Source", dob: "1991-02-02" });
    const srcPlan = await getOrCreateDraftPlan(srcPatient);
    const i1 = await addPlanItem(srcPlan, productA);
    await setItemDosing(i1, presetId, null);
    const i2 = await addPlanItem(srcPlan, productB);
    await setItemDosing(i2, null, "Take 2 with dinner.");

    const protocolId = await savePlanAsProtocol(srcPlan, "Energy Support", "For tired patients");

    const detail = await getProtocol(protocolId);
    expect(detail!.name).toBe("Energy Support");
    expect(detail!.items).toHaveLength(2);
    expect(detail!.items[0].dosingText).toBe("Take 1 in the morning.");
    expect(detail!.items[1].dosingText).toBe("Take 2 with dinner.");

    expect((await listProtocols()).some((p) => p.id === protocolId && p.itemCount === 2)).toBe(true);

    // Apply to a different patient's plan.
    const targetPlan = await getOrCreateDraftPlan(patientId);
    const added = await applyProtocolToPlan(protocolId, targetPlan);
    expect(added).toBe(2);
    const plan = await getPlan(targetPlan);
    expect(plan!.items).toHaveLength(2);
    expect(plan!.items.map((it) => it.dosingText).sort()).toEqual(["Take 1 in the morning.", "Take 2 with dinner."].sort());
  });
});
