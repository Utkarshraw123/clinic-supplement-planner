import { describe, it, expect } from "vitest";
import { suggestForPatient } from "@/lib/recommend";
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

function product(id: number, name: string, tags: ProductDetail["tags"]): ProductDetail {
  return { id, brand_id: 1, brand_name: "B", name, package_size: null, form: null, default_note: null, status: "active", tags, suppliers: [], alternatives: [] };
}

describe("recommendations", () => {
  const attrs: PatientAttr[] = [
    { termId: 1, label: "mushroom", attrType: "allergy" },
    { termId: 2, label: "energy", attrType: "goal" },
    { termId: 3, label: "vegan", attrType: "diet" },
  ];

  it("excludes allergen-conflicting products entirely", () => {
    const products = [
      product(10, "Mushroom Complex", [{ termId: 1, label: "mushroom", tagType: "allergen" }, { termId: 2, label: "energy", tagType: "concern" }]),
      product(11, "Iron", [{ termId: 2, label: "energy", tagType: "concern" }]),
    ];
    const out = suggestForPatient(products, attrs);
    expect(out.map((s) => s.product.id)).not.toContain(10);
    expect(out.map((s) => s.product.id)).toContain(11);
  });

  it("excludes hard diet violations (declared non-vegan)", () => {
    const products = [
      product(12, "Fish Oil", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 4, label: "vegetarian", tagType: "diet" }]),
      product(13, "Algae Oil", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 5, label: "vegan", tagType: "diet" }]),
    ];
    const out = suggestForPatient(products, attrs);
    expect(out.map((s) => s.product.id)).not.toContain(12);
    expect(out.map((s) => s.product.id)).toContain(13);
  });

  it("ranks by goal-match score and only keeps positive matches, with reasons", () => {
    const products = [
      product(14, "Two Match", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 6, label: "sleep", tagType: "concern" }]),
      product(15, "One Match", [{ termId: 2, label: "energy", tagType: "concern" }]),
      product(16, "No Match", [{ termId: 7, label: "immunity", tagType: "concern" }]),
    ];
    const goalsOnly: PatientAttr[] = [
      { termId: 2, label: "energy", attrType: "goal" },
      { termId: 6, label: "sleep", attrType: "goal" },
    ];
    const out = suggestForPatient(products, goalsOnly);
    expect(out.map((s) => s.product.id)).toEqual([14, 15]);
    expect(out[0].reasons).toContain("targets energy");
    expect(out[0].reasons).toContain("targets sleep");
    expect(out[0].reasons).toContain("allergy-safe");
  });

  it("adds a diet-friendly reason when the product declares the patient's diet", () => {
    const products = [product(17, "Vegan D", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 5, label: "vegan", tagType: "diet" }])];
    const out = suggestForPatient(products, attrs);
    expect(out[0].reasons).toContain("vegan-friendly");
  });

  it("respects the limit", () => {
    const products = Array.from({ length: 5 }, (_, i) => product(20 + i, `P${i}`, [{ termId: 2, label: "energy", tagType: "concern" }]));
    const out = suggestForPatient(products, [{ termId: 2, label: "energy", attrType: "goal" }], 3);
    expect(out).toHaveLength(3);
  });
});
