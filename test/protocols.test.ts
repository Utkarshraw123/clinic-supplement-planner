import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, setItemDosing, getPlan, setItemNote, setItemDuration, setItemSize, setItemOrderCodeStored } from "@/lib/plans";
import { execute } from "@/lib/db";
import { savePlanAsProtocol, listProtocols, getProtocol, applyProtocolToPlan, createProtocol, addProtocolItem, removeProtocolItem, setProtocolItemDosing, updateProtocolMeta, updateProtocolSections } from "@/lib/protocols";
import { savePlanGuide, getPlanGuide } from "@/lib/guide";

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

  it("builds a protocol from scratch (no patient), edits it, and applies it", async () => {
    const protocolId = await createProtocol("Menopause Starter", "First 8 weeks");
    const it1 = await addProtocolItem(protocolId, productA);
    const it2 = await addProtocolItem(protocolId, productB);
    await setProtocolItemDosing(it1, presetId, null);
    await setProtocolItemDosing(it2, null, "Take 2 with dinner.");

    let detail = await getProtocol(protocolId);
    expect(detail!.name).toBe("Menopause Starter");
    expect(detail!.items).toHaveLength(2);
    expect(detail!.items[0].dosingText).toBe("Take 1 in the morning.");
    expect(detail!.items[0].brandName).toBeTruthy();

    // Remove one item + rename.
    await removeProtocolItem(it2);
    await updateProtocolMeta(protocolId, "Menopause Starter v2", "Updated");
    detail = await getProtocol(protocolId);
    expect(detail!.name).toBe("Menopause Starter v2");
    expect(detail!.items).toHaveLength(1);

    // Apply the from-scratch protocol to a plan.
    const targetPlan = await getOrCreateDraftPlan(await createPatient({ name: "Scratch Target", dob: "1992-03-03" }));
    const added = await applyProtocolToPlan(protocolId, targetPlan);
    expect(added).toBe(1);
    const plan = await getPlan(targetPlan);
    expect(plan!.items[0].dosingText).toBe("Take 1 in the morning.");
  });

  it("saves both pages: every item field and the four page-2 sections", async () => {
    const srcPlan = await getOrCreateDraftPlan(await createPatient({ name: "Full Src", dob: "1990-01-01" }));
    const i1 = await addPlanItem(srcPlan, productA);
    await setItemDosing(i1, null, "1 at night");
    await setItemNote(i1, "with food");
    await setItemDuration(i1, "3 months");
    await setItemSize(i1, "90 capsules");
    await setItemOrderCodeStored(i1, "WN10");
    await savePlanGuide(srcPlan, {
      consultationDate: "2026-08-26", intro: "Hi Jane", nextConsultation: "Gut cleanse next",
      lifestyle: "Sleep 8h", dietary: "More greens", supplementText: null, medsText: "- Levothyroxine", notes: "Call me",
    });

    const protocolId = await savePlanAsProtocol(srcPlan, "Full Protocol", null);
    const d = (await getProtocol(protocolId))!;
    expect(d.items[0]).toMatchObject({ note: "with food", duration: "3 months", size: "90 capsules", orderCode: "WN10", dosingText: "1 at night" });
    expect(d).toMatchObject({ nextConsultation: "Gut cleanse next", lifestyle: "Sleep 8h", dietary: "More greens", notes: "Call me" });
  });

  it("applying a full protocol copies item fields and merges page 2 (fill empty, append filled, never touch intro/meds/date)", async () => {
    const protocolId = await createProtocol("Merge Test", null);
    const it1 = await addProtocolItem(protocolId, productB);
    await execute("UPDATE protocol_items SET note = ?, duration = ?, size = ?, order_code = ? WHERE id = ?", ["at dinner", "1 month", "60 capsules", "", it1]);
    await updateProtocolSections(protocolId, { nextConsultation: null, lifestyle: "Walk daily", dietary: "Low sugar", notes: null });

    const target = await getOrCreateDraftPlan(await createPatient({ name: "Merge Target", dob: "1990-01-01" }));
    await savePlanGuide(target, {
      consultationDate: "2026-09-01", intro: "Hello Sam", nextConsultation: null,
      lifestyle: "Sleep 8h", dietary: null, supplementText: null, medsText: "- Metformin", notes: null,
    });
    await applyProtocolToPlan(protocolId, target);

    const plan = (await getPlan(target))!;
    const item = plan.items.find((i) => i.product.id === productB)!;
    expect(item).toMatchObject({ note: "at dinner", duration: "1 month", size: "60 capsules", orderCode: "" });
    const g = (await getPlanGuide(target))!;
    expect(g.lifestyle).toBe("Sleep 8h\n\nWalk daily"); // appended
    expect(g.dietary).toBe("Low sugar");                // filled
    expect(g.intro).toBe("Hello Sam");                  // untouched
    expect(g.medsText).toBe("- Metformin");             // untouched
    expect(g.consultationDate).toBe("2026-09-01");      // untouched
  });

  it("applying an old-style protocol (no page-2 text) creates no guide row", async () => {
    const protocolId = await createProtocol("Old Style", null);
    await addProtocolItem(protocolId, productA);
    const target = await getOrCreateDraftPlan(await createPatient({ name: "Old Target", dob: "1990-01-01" }));
    await applyProtocolToPlan(protocolId, target);
    expect(await getPlanGuide(target)).toBeNull();
  });
});
