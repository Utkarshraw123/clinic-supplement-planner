import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

export type Flag = { level: "block"|"warn"; reason: string };

const norm = (s: string) => s.trim().toLowerCase();

export function flagProductForPatient(product: ProductDetail, attributes: PatientAttr[]): Flag[] {
  const flags: Flag[] = [];
  const allergyLabels = new Set(attributes.filter((a) => a.attrType === "allergy").map((a) => norm(a.label)));
  const conditionLabels = new Set(attributes.filter((a) => a.attrType === "med_condition").map((a) => norm(a.label)));
  const dietPrefs = attributes.filter((a) => a.attrType === "diet").map((a) => norm(a.label));

  const productAllergenIngredient = product.tags
    .filter((t) => t.tagType === "allergen" || t.tagType === "ingredient")
    .map((t) => norm(t.label));
  const productCautions = product.tags.filter((t) => t.tagType === "caution").map((t) => norm(t.label));
  const productDiets = product.tags.filter((t) => t.tagType === "diet").map((t) => norm(t.label));

  for (const label of productAllergenIngredient) {
    if (allergyLabels.has(label)) flags.push({ level: "block", reason: `contains ${label} (patient allergy)` });
  }
  for (const label of productCautions) {
    if (conditionLabels.has(label)) flags.push({ level: "warn", reason: `caution: ${label}` });
  }
  if (productDiets.length > 0) {
    for (const diet of dietPrefs) {
      if (!productDiets.includes(diet)) flags.push({ level: "warn", reason: `not tagged ${diet}` });
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
