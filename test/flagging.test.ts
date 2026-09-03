import { describe, it, expect } from "vitest";
import { flagProductForPatient, hasBlock, scoreProductForPatient } from "@/lib/flagging";
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

function product(partial: Partial<ProductDetail>): ProductDetail {
  return {
    id: 1, brand_id: 1, brand_name: "B", brand_promo_code: null, name: "P", description: null, package_size: null, form: null, default_note: null, status: "active",
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

  it("hard-blocks a fish-tagged product for a verbose 'fish' allergy label", () => {
    // Clinicians type things like "fish product" or "fish oil" rather than the bare
    // canonical "fish" term. A whole-word match on the allergen still blocks (fail-safe).
    const omega = product({ tags: [{ termId: 4, label: "fish", tagType: "allergen" }] });
    for (const label of ["fish", "Fish", "fish product", "Fish Oil", "allergic to fish"]) {
      const flags = flagProductForPatient(omega, [{ termId: 1, label, attrType: "allergy" }]);
      expect(hasBlock(flags), `expected block for allergy "${label}"`).toBe(true);
      expect(flags.find((f) => f.level === "block")?.reason).toContain("fish");
    }
  });

  it("does NOT confuse distinct allergens (shellfish vs fish are not substrings of each other)", () => {
    const fishProduct = product({ tags: [{ termId: 4, label: "fish", tagType: "allergen" }] });
    expect(hasBlock(flagProductForPatient(fishProduct, [{ termId: 1, label: "shellfish", attrType: "allergy" }]))).toBe(false);
    const shellfishProduct = product({ tags: [{ termId: 4, label: "shellfish", tagType: "allergen" }] });
    expect(hasBlock(flagProductForPatient(shellfishProduct, [{ termId: 1, label: "fish", attrType: "allergy" }]))).toBe(false);
  });

  it("does NOT fuzzy-match ingredients (a 'milk' allergy must not block 'milk thistle')", () => {
    // Ingredient names legitimately embed allergen words; keep ingredient matching exact.
    const milkThistle = product({ tags: [{ termId: 4, label: "milk thistle", tagType: "ingredient" }] });
    expect(hasBlock(flagProductForPatient(milkThistle, [{ termId: 1, label: "milk", attrType: "allergy" }]))).toBe(false);
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

  // Every "vegan but fish/marine OK" wording gets the marine exception (not just one exact label).
  it.each([
    "Vegan but Fish Product",
    "Vegan but Fish Oil is fine",
    "Vegan (marine OK)",
  ])("'%s' accepts marine products but still warns on other non-vegan ones", (label) => {
    const marineOk: PatientAttr[] = [{ termId: 3, label, attrType: "diet" }];
    const isDietWarn = (f: { kind?: string }) => f.kind === "diet";
    // A marine omega-3 product (tagged fish) with a non-vegan diet tag: no diet warn.
    const omega = product({ tags: [{ termId: 4, label: "fish", tagType: "allergen" }, { termId: 5, label: "dairy free", tagType: "diet" }] });
    expect(flagProductForPatient(omega, marineOk).some(isDietWarn)).toBe(false);
    // Marine collagen is also accepted.
    const collagen = product({ tags: [{ termId: 8, label: "marine collagen", tagType: "ingredient" }, { termId: 9, label: "vegetarian", tagType: "diet" }] });
    expect(flagProductForPatient(collagen, marineOk).some(isDietWarn)).toBe(false);
    // A non-marine, non-vegan product still warns.
    const gelatine = product({ tags: [{ termId: 6, label: "vegetarian", tagType: "diet" }] });
    expect(flagProductForPatient(gelatine, marineOk).some(isDietWarn)).toBe(true);
    // A plain vegan patient is NOT given the marine exception.
    const veganOnly: PatientAttr[] = [{ termId: 7, label: "vegan", attrType: "diet" }];
    expect(flagProductForPatient(omega, veganOnly).some(isDietWarn)).toBe(true);
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
