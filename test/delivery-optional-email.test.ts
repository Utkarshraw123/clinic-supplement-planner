import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, getPlan } from "@/lib/plans";
import { finalisePlanToSnapshot, sendSnapshotEmail, listSnapshotsForPatient, getSnapshotPdf } from "@/lib/delivery";

describe("finalise without email, then send later", () => {
  beforeAll(async () => { await runMigrations(); });

  it("finalises to a downloadable snapshot with no email, then emails it later", async () => {
    const brandId = await createBrand({ name: `Opt ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Opt Magnesium", form: "capsule" });
    const patientId = await createPatient({ name: "Opt P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    const { snapshotId } = await finalisePlanToSnapshot({ planId });
    expect((await getPlan(planId))!.status).toBe("finalised");
    const pdf = await getSnapshotPdf(snapshotId);
    expect(pdf!.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Snapshot exists but is not yet sent.
    let snaps = await listSnapshotsForPatient(patientId);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].sent_at).toBeNull();

    // Now email it.
    const res = await sendSnapshotEmail({ snapshotId, email: "later@example.com" });
    expect(res.mocked).toBe(true);
    snaps = await listSnapshotsForPatient(patientId);
    expect(snaps[0].sent_to_email).toBe("later@example.com");
    expect(snaps[0].sent_at).not.toBeNull();
  });

  it("refuses to finalise a plan that has an allergen block", async () => {
    const brandId = await createBrand({ name: `OptBlk ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "OptBlk Mushroom", form: "capsule" });
    const mushroom = await addTerm("allergen", `mushroom-${Date.now()}`);
    await setProductTags(productId, [{ termId: mushroom, tagType: "allergen" }]);
    const patientId = await createPatient({ name: "OptBlk P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }]);
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    await expect(finalisePlanToSnapshot({ planId })).rejects.toThrow(/blocked item/);
  });
});
