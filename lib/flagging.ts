import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

export type Flag = { level: "block"|"warn"; reason: string; kind: "allergy"|"caution"|"diet" };

const norm = (s: string) => s.trim().toLowerCase();

// True when the canonical allergen term appears as a whole word/phrase inside a
// (possibly verbose) patient allergy label, in either direction. Clinicians rarely
// type the bare token — they write "fish product", "fish oil", "allergic to fish" —
// so an exact-only match silently fails to block. Whole-word matching keeps distinct
// allergens apart (e.g. "fish" never matches "shellfish", which is a substring not a
// word) while erring toward blocking, which is the safe bias for an allergy.
function allergenMatchesAllergy(patientLabel: string, allergen: string): boolean {
  if (patientLabel === allergen) return true;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inPatient = new RegExp(`\\b${esc(allergen)}\\b`).test(patientLabel);
  const inAllergen = new RegExp(`\\b${esc(patientLabel)}\\b`).test(allergen);
  return inPatient || inAllergen;
}

export function flagProductForPatient(product: ProductDetail, attributes: PatientAttr[]): Flag[] {
  const flags: Flag[] = [];
  const allergyLabels = attributes.filter((a) => a.attrType === "allergy").map((a) => norm(a.label));
  const conditionLabels = new Set(attributes.filter((a) => a.attrType === "med_condition").map((a) => norm(a.label)));
  const dietPrefs = attributes.filter((a) => a.attrType === "diet").map((a) => norm(a.label));

  const productAllergens = product.tags.filter((t) => t.tagType === "allergen").map((t) => norm(t.label));
  // Ingredient names legitimately embed allergen words ("milk thistle", "coconut"),
  // so ingredients match only exactly — never by whole-word containment.
  const productIngredients = product.tags.filter((t) => t.tagType === "ingredient").map((t) => norm(t.label));
  const productCautions = product.tags.filter((t) => t.tagType === "caution").map((t) => norm(t.label));
  const productDiets = product.tags.filter((t) => t.tagType === "diet").map((t) => norm(t.label));

  // Marine-sourced products: some vegans accept omega-3 fish oil / marine collagen.
  const MARINE = new Set(["fish", "omega 3", "omega-3", "collagen", "marine collagen"]);
  const productIsMarine = [...productAllergens, ...productIngredients].some((label) => MARINE.has(label));

  // A "vegan but fish/marine is fine" diet — matches any such wording
  // ("Vegan but Fish Product", "Vegan but Fish Oil is fine", "Vegan (marine OK)", …),
  // so a marine product (or a plain vegan one) does not warn for these patients.
  const isVeganMarineDiet = (d: string) => d.startsWith("vegan") && /(fish|marine)/.test(d);

  const blocked = new Set<string>();
  const block = (label: string) => {
    if (blocked.has(label)) return;
    blocked.add(label);
    flags.push({ level: "block", reason: `contains ${label} (patient allergy)`, kind: "allergy" });
  };
  for (const allergen of productAllergens) {
    if (allergyLabels.some((patientLabel) => allergenMatchesAllergy(patientLabel, allergen))) block(allergen);
  }
  for (const ingredient of productIngredients) {
    if (allergyLabels.includes(ingredient)) block(ingredient);
  }
  for (const label of productCautions) {
    if (conditionLabels.has(label)) flags.push({ level: "warn", reason: `caution: ${label}`, kind: "caution" });
  }
  if (productDiets.length > 0) {
    for (const diet of dietPrefs) {
      if (productDiets.includes(diet)) continue;
      // A "vegan but fish/marine OK" diet is satisfied by a vegan product OR any marine-sourced one.
      if (isVeganMarineDiet(diet) && (productDiets.includes("vegan") || productIsMarine)) continue;
      flags.push({ level: "warn", reason: `not marked suitable for the ${diet} diet`, kind: "diet" });
    }
  }
  return flags;
}

export function hasBlock(flags: Flag[]): boolean {
  return flags.some((f) => f.level === "block");
}

export function scoreProductForPatient(product: ProductDetail, attributes: PatientAttr[]): number {
  const goals = new Set(attributes.filter((a) => a.attrType === "goal").map((a) => norm(a.label)));
  return product.tags.filter((t) => t.tagType === "concern" && goals.has(norm(t.label))).length;
}
