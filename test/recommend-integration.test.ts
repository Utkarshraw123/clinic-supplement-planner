import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags, getProduct } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { suggestForPatient } from "@/lib/recommend";

describe("recommendation integration", () => {
  it("suggests a safe, goal-matching product and hides the allergen one", async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `Rec ${Date.now()}` });
    const energy = await addTerm("concern", "energy");
    const mushroom = await addTerm("allergen", "mushroom");

    const safeId = await createProduct({ brandId, name: "Safe Energy", form: "capsule" });
    await setProductTags(safeId, [{ termId: energy, tagType: "concern" }]);
    const unsafeId = await createProduct({ brandId, name: "Mushroom Energy", form: "capsule" });
    await setProductTags(unsafeId, [{ termId: energy, tagType: "concern" }, { termId: mushroom, tagType: "allergen" }]);

    const patientId = await createPatient({ name: "Rec P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }, { termId: energy, attrType: "goal" }]);

    const patient = await getPatient(patientId);
    const products = [await getProduct(safeId), await getProduct(unsafeId)].filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProduct>>>[];
    const out = suggestForPatient(products, patient!.attributes);

    expect(out.map((s) => s.product.id)).toContain(safeId);
    expect(out.map((s) => s.product.id)).not.toContain(unsafeId);
    expect(out[0].reasons).toContain("targets energy");
  });
});
