import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, addSupplierLink, linkAlternative } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import * as Plans from "@/lib/plans";
import { execute } from "@/lib/db";

describe("plans", () => {
  let patientId = 0, productId = 0, presetId = 0;
  beforeAll(async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `PlanBrand ${Date.now()}` });
    productId = await createProduct({ brandId, name: "Test Magnesium", form: "capsule" });
    patientId = await createPatient({ name: "Test P", dob: "1990-01-01" });
    const rs = await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", ["evening", "Take 1 capsule in the evening."]);
    presetId = Number(rs.lastInsertRowid);
  });

  it("gets/creates one draft plan per patient (idempotent)", async () => {
    const a = await Plans.getOrCreateDraftPlan(patientId);
    const b = await Plans.getOrCreateDraftPlan(patientId);
    expect(a).toBe(b);
  });

  it("adds an item, sets dosing (custom overrides preset), and reads it back", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    const itemId = await Plans.addPlanItem(planId, productId);
    await Plans.setItemDosing(itemId, presetId, null);
    let plan = await Plans.getPlan(planId);
    expect(plan!.items[0].dosingText).toBe("Take 1 capsule in the evening.");

    await Plans.setItemDosing(itemId, presetId, "Take 2 with lunch.");
    plan = await Plans.getPlan(planId);
    expect(plan!.items[0].dosingText).toBe("Take 2 with lunch.");
  });

  it("batch-loads a multi-item plan with suppliers, alternatives and order intact", async () => {
    const brandId = await createBrand({ name: `MB ${Date.now()}` });
    const p1 = await createProduct({ brandId, name: "Batch Vitamin D", form: "capsule" });
    const p2 = await createProduct({ brandId, name: "Batch Omega 3", form: "softgel" });
    await addSupplierLink(p1, "Wild Nutrition", "https://example.com/vitamin-d");
    await linkAlternative(p1, p2);
    const patient2 = await createPatient({ name: "Batch P", dob: "1991-02-02" });
    const planId = await Plans.getOrCreateDraftPlan(patient2);
    await Plans.addPlanItem(planId, p1);
    await Plans.addPlanItem(planId, p2);

    const plan = await Plans.getPlan(planId);
    expect(plan!.items.map((i) => i.product.name)).toEqual(["Batch Vitamin D", "Batch Omega 3"]);
    const first = plan!.items[0].product;
    expect(first.suppliers[0].url).toBe("https://example.com/vitamin-d"); // needed for guide "Buy online" links
    expect(first.alternatives.map((a) => a.name)).toContain("Batch Omega 3");
  });

  it("finalises a plan", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    await Plans.finalisePlan(planId);
    const plan = await Plans.getPlan(planId);
    expect(plan!.status).toBe("finalised");
  });
});
