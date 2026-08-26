import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, setItemDosing, getPlan } from "@/lib/plans";
import { defaultSupplementText, defaultMedsText, savePlanGuide, getPlanGuide, getGuideForEditing, todayIso } from "@/lib/guide";

describe("plan guide", () => {
  beforeAll(async () => { await runMigrations(); });

  it("builds a numbered supplement list from plan items + dosing", async () => {
    const brandId = await createBrand({ name: `G ${Date.now()}` });
    const magId = await createProduct({ brandId, name: "Food-Grown Magnesium", form: "capsule" });
    const vitId = await createProduct({ brandId, name: "Food-Grown Vitamin D", form: "capsule" });
    const patientId = await createPatient({ name: "Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    const it1 = await addPlanItem(planId, magId);
    await addPlanItem(planId, vitId);
    await setItemDosing(it1, null, "1 capsule with evening meal");
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("1. Food-Grown Magnesium — 1 capsule with evening meal");
    expect(text).toContain("2. Food-Grown Vitamin D");
  });

  it("builds a bullet meds list from the patient's med_condition attributes", async () => {
    const patientId = await createPatient({ name: "Meds P", dob: "1990-01-01" });
    const t1 = await addTerm("caution", `levothyroxine-${Date.now()}`);
    await setPatientAttributes(patientId, [{ termId: t1, attrType: "med_condition" }]);
    const patient = (await getPatient(patientId))!;
    expect(defaultMedsText(patient)).toMatch(/^- levothyroxine/);
  });

  it("saves and reloads guide fields, and fills defaults for empty fields", async () => {
    const brandId = await createBrand({ name: `G2 ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "G2 Magnesium", form: "capsule" });
    const patientId = await createPatient({ name: "Edit P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, pid);
    const plan = (await getPlan(planId))!;
    const patient = (await getPatient(patientId))!;

    // Before any save: defaults kick in (today's date, supplement text from items).
    const initial = await getGuideForEditing(plan, patient);
    expect(initial.consultationDate).toBe(todayIso());
    expect(initial.supplementText).toContain("G2 Magnesium");
    expect(initial.intro).toBe("");

    // Practitioner edits + saves.
    await savePlanGuide(planId, {
      consultationDate: "2026-08-26", intro: "Here we go", nextConsultation: null,
      lifestyle: "Sleep well", dietary: null, supplementText: "1. Custom wording", medsText: null,
    });
    const saved = await getPlanGuide(planId);
    expect(saved!.intro).toBe("Here we go");
    expect(saved!.supplementText).toBe("1. Custom wording");

    // getGuideForEditing now returns saved values (not the auto default) where present.
    const reloaded = await getGuideForEditing(plan, patient);
    expect(reloaded.supplementText).toBe("1. Custom wording");
    expect(reloaded.lifestyle).toBe("Sleep well");
  });
});
