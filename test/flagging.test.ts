import { describe, it, expect } from "vitest";
import { flagProductForPatient, hasBlock, scoreProductForPatient } from "@/lib/flagging";
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

function product(partial: Partial<ProductDetail>): ProductDetail {
  return {
    id: 1, brand_id: 1, brand_name: "B", name: "P", package_size: null, form: null, default_note: null, status: "active",
    tags: [], suppliers: [], alternatives: [], ...partial,
  };
}

describe("flagging", () => {
  it("hard-blocks when an allergen/ingredient matches a patient allergy", () => {
    const p = product({ tags: [{ termId: 1, label: "mushroom", tagType: "ingredient" }] });
    const attrs: PatientAttr[] = [{ termId: 9, label: "Mushroom", attrType: "allergy" }];
    const flags = flagProductForPatient(p, attrs);
    expect(hasBlock(flags)).toBe(true);
    expect(flags[0].level).toBe("block");
  });

  it("soft-warns when a caution matches a med/condition", () => {
    const p = product({ tags: [{ termId: 2, label: "pregnancy", tagType: "caution" }] });
    const attrs: PatientAttr[] = [{ termId: 8, label: "pregnancy", attrType: "med_condition" }];
    const flags = flagProductForPatient(p, attrs);
    expect(hasBlock(flags)).toBe(false);
    expect(flags[0].level).toBe("warn");
  });

  it("soft-warns on diet mismatch only when the product declares diets", () => {
    const veganPatient: PatientAttr[] = [{ termId: 3, label: "vegan", attrType: "diet" }];
    const declaredNonVegan = product({ tags: [{ termId: 4, label: "vegetarian", tagType: "diet" }] });
    expect(flagProductForPatient(declaredNonVegan, veganPatient).some((f) => f.reason.includes("vegan"))).toBe(true);
    const noDietInfo = product({ tags: [] });
    expect(flagProductForPatient(noDietInfo, veganPatient)).toHaveLength(0);
  });

  it("scores concern/goal overlap and never blocks on score alone", () => {
    const p = product({ tags: [{ termId: 5, label: "energy", tagType: "concern" }, { termId: 6, label: "sleep", tagType: "concern" }] });
    const attrs: PatientAttr[] = [{ termId: 7, label: "energy", attrType: "goal" }];
    expect(scoreProductForPatient(p, attrs)).toBe(1);
  });

  it("returns no flags for a clean product", () => {
    const p = product({ tags: [{ termId: 1, label: "magnesium", tagType: "ingredient" }] });
    const attrs: PatientAttr[] = [{ termId: 9, label: "shellfish", attrType: "allergy" }];
    expect(flagProductForPatient(p, attrs)).toHaveLength(0);
  });
});
