import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, setItemDosing, setItemNote, setItemDuration, setItemOrderCode, getPlan } from "@/lib/plans";
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

  it("adds a product's description as a line beneath its supplement", async () => {
    const brandId = await createBrand({ name: `GD ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "GD Magnesium", form: "capsule", description: "Supports sleep & muscle relaxation" });
    const patientId = await createPatient({ name: "Desc Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, pid);
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("1. GD Magnesium");
    expect(text).toContain("\nSupports sleep & muscle relaxation");
  });

  it("uses a per-item practitioner note in the supplement line (over the default note)", async () => {
    const brandId = await createBrand({ name: `GN ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "GN Iron", form: "capsule", defaultNote: "Take with food" });
    const patientId = await createPatient({ name: "Note Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    const itemId = await addPlanItem(planId, pid);
    await setItemNote(itemId, "Take one capsule with breakfast");
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("1. GN Iron · Take one capsule with breakfast");
    expect(text).not.toContain("Take with food"); // per-item note overrides the product default
  });

  it("appends duration ('for 3 months') and order code to the supplement line", async () => {
    const brandId = await createBrand({ name: `GDur ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "GDur Magnesium", form: "capsule" });
    const patientId = await createPatient({ name: "Dur Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    const itemId = await addPlanItem(planId, pid);
    await setItemDosing(itemId, null, "1 capsule daily");
    await setItemDuration(itemId, "3 months");
    await setItemOrderCode(itemId, "WN10");
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("1. GDur Magnesium — 1 capsule daily · for 3 months · order code: WN10");
  });

  it("renders 'Finish off, no repeat' verbatim (not 'for Finish off…')", async () => {
    const brandId = await createBrand({ name: `GFin ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "GFin Iron", form: "capsule" });
    const patientId = await createPatient({ name: "Fin Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    const itemId = await addPlanItem(planId, pid);
    await setItemDuration(itemId, "Finish off, no repeat");
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("· finish off, no repeat");
    expect(text).not.toContain("for Finish off");
  });

  it("omits duration and order code segments when they are unset", async () => {
    const brandId = await createBrand({ name: `GNone ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "GNone Zinc", form: "capsule" });
    const patientId = await createPatient({ name: "None Guide P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, pid);
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("1. GNone Zinc");
    expect(text).not.toContain("order code");
    expect(text).not.toContain("for ");
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
