import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, addSupplierLink, linkAlternative } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import * as Plans from "@/lib/plans";
import { execute, query } from "@/lib/db";

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

  it("sets and reads back per-item duration and order code (empty → null)", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    const itemId = await Plans.addPlanItem(planId, productId);
    await Plans.setItemDuration(itemId, "3 months");
    await Plans.setItemOrderCode(itemId, "WN10");
    let plan = await Plans.getPlan(planId);
    let item = plan!.items.find((i) => i.id === itemId)!;
    expect(item.duration).toBe("3 months");
    expect(item.orderCode).toBe("WN10");

    await Plans.setItemDuration(itemId, "   ");
    await Plans.setItemOrderCode(itemId, "");
    plan = await Plans.getPlan(planId);
    item = plan!.items.find((i) => i.id === itemId)!;
    expect(item.duration).toBeNull();
    expect(item.orderCode).toBeNull();
  });

  it("duplicates a plan into a new draft for the same patient (all fields copied, source untouched)", async () => {
    const brandId = await createBrand({ name: `Dup ${Date.now()}` });
    const p1 = await createProduct({ brandId, name: "Dup Magnesium", form: "capsule" });
    const p2 = await createProduct({ brandId, name: "Dup Iron", form: "capsule" });
    const patient = await createPatient({ name: "Dup P", dob: "1990-01-01" });
    const src = await Plans.getOrCreateDraftPlan(patient);
    const i1 = await Plans.addPlanItem(src, p1);
    await Plans.addPlanItem(src, p2);
    await Plans.setItemDosing(i1, null, "1 capsule at night");
    await Plans.setItemDuration(i1, "3 months");
    await Plans.setItemOrderCode(i1, "WN10");
    await Plans.setItemNote(i1, "with food");
    await Plans.finalisePlan(src);

    const dupId = await Plans.duplicatePlan(src);
    expect(dupId).not.toBe(src);
    const dup = (await Plans.getPlan(dupId))!;
    expect(dup.status).toBe("draft");
    expect(dup.patientId).toBe(patient);
    expect(dup.items.map((i) => i.product.name)).toEqual(["Dup Magnesium", "Dup Iron"]);
    const mag = dup.items.find((i) => i.product.name === "Dup Magnesium")!;
    expect(mag.dosingText).toBe("1 capsule at night");
    expect(mag.duration).toBe("3 months");
    expect(mag.orderCode).toBe("WN10");
    expect(mag.note).toBe("with food");
    // source untouched
    const source = (await Plans.getPlan(src))!;
    expect(source.status).toBe("finalised");
    expect(source.items.length).toBe(2);
  });

  it("deletes a draft plan and its items but leaves the patient and other plans", async () => {
    const brandId = await createBrand({ name: `Del ${Date.now()}` });
    const prod = await createProduct({ brandId, name: "Del Zinc", form: "capsule" });
    const patient = await createPatient({ name: "Del P", dob: "1990-01-01" });
    const keep = await Plans.getOrCreateDraftPlan(patient);
    await Plans.addPlanItem(keep, prod);
    await Plans.finalisePlan(keep); // keep this one as a finalised plan
    const doomed = await Plans.duplicatePlan(keep);
    await Plans.deletePlan(doomed);

    expect(await Plans.getPlan(doomed)).toBeNull();
    expect((await Plans.getPlan(keep))!.items.length).toBe(1); // untouched
    const stillThere = await createPatient({ name: "unrelated", dob: "1990-01-01" });
    expect(stillThere).toBeGreaterThan(0);
    const patientRow = await query<{ id: number }>("SELECT id FROM patients WHERE id = ?", [patient]);
    expect(patientRow.length).toBe(1); // patient survives
  });

  it("resolveDraftPlanId honours a valid draft of the patient, else the default draft", async () => {
    const patient = await createPatient({ name: "Resolve P", dob: "1990-01-01" });
    const def = await Plans.getOrCreateDraftPlan(patient);
    // A second draft via duplicate of the (empty) default:
    const second = await Plans.duplicatePlan(def);
    expect(await Plans.resolveDraftPlanId(patient, second)).toBe(second);
    // Requesting a non-existent / non-owned id falls back to the patient's default draft.
    const fallback = await Plans.resolveDraftPlanId(patient, 999999);
    expect([def, second]).toContain(fallback);
  });

  it("listDraftPlans returns only drafts with item counts and patient names", async () => {
    const brandId = await createBrand({ name: `LD ${Date.now()}` });
    const prod = await createProduct({ brandId, name: "LD Vit D", form: "capsule" });
    const patient = await createPatient({ name: `ListDraft P ${Date.now()}`, dob: "1990-01-01" });
    const plan = await Plans.getOrCreateDraftPlan(patient);
    await Plans.addPlanItem(plan, prod);
    const drafts = await Plans.listDraftPlans();
    const mine = drafts.find((d) => d.planId === plan);
    expect(mine).toBeTruthy();
    expect(mine!.patientName).toContain("ListDraft P");
    expect(Number(mine!.itemCount)).toBe(1);
  });

  it("finalises a plan", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    await Plans.finalisePlan(planId);
    const plan = await Plans.getPlan(planId);
    expect(plan!.status).toBe("finalised");
  });
});
