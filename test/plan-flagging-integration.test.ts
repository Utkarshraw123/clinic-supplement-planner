import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, getPlan } from "@/lib/plans";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";

describe("plan + flagging integration", () => {
  it("flags a plan item that conflicts with the patient's allergy", async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `Flag ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Mushroom Complex", form: "capsule" });
    const mushroom = await addTerm("allergen", "mushroom");
    await setProductTags(productId, [{ termId: mushroom, tagType: "allergen" }]);

    const patientId = await createPatient({ name: "Allergic P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }]);

    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    const plan = await getPlan(planId);
    const patient = await getPatient(patientId);
    const flags = flagProductForPatient(plan!.items[0].product, patient!.attributes);
    expect(hasBlock(flags)).toBe(true);
  });
});
