import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { finaliseAndSend, listSnapshots, getSnapshotPdf } from "@/lib/delivery";

describe("delivery", () => {
  beforeAll(async () => { await runMigrations(); });

  it("blocks sending when an item conflicts with a patient allergy", async () => {
    const brandId = await createBrand({ name: `Del ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Mushroom X", form: "capsule" });
    const mushroom = await addTerm("allergen", "mushroom");
    await setProductTags(productId, [{ termId: mushroom, tagType: "allergen" }]);
    const patientId = await createPatient({ name: "Blocked P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }]);
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    await expect(finaliseAndSend({ planId, email: "c@example.com" })).rejects.toThrow(/blocked item/);
  });

  it("finalises, snapshots a PDF, and mock-sends a clean plan", async () => {
    const brandId = await createBrand({ name: `Clean ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Clean Magnesium", form: "capsule" });
    const patientId = await createPatient({ name: "Clean P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    const res = await finaliseAndSend({ planId, email: "c@example.com" });
    expect(res.mocked).toBe(true);
    const snaps = await listSnapshots(planId);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].sent_to_email).toBe("c@example.com");
    const pdf = await getSnapshotPdf(res.snapshotId);
    expect(pdf!.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
