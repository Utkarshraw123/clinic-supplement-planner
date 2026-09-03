import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";
import { flagProductForPatient, hasBlock, scoreProductForPatient } from "@/lib/flagging";

export type Suggestion = { product: ProductDetail; score: number; reasons: string[] };

const norm = (s: string) => s.trim().toLowerCase();

export function suggestForPatient(products: ProductDetail[], attributes: PatientAttr[], limit = 10): Suggestion[] {
  const goalLabels = attributes.filter((a) => a.attrType === "goal").map((a) => norm(a.label));
  const dietLabels = attributes.filter((a) => a.attrType === "diet").map((a) => norm(a.label));

  const suggestions: Suggestion[] = [];
  for (const product of products) {
    const flags = flagProductForPatient(product, attributes);
    // Stage 1: exclude hard blocks and hard diet violations.
    if (hasBlock(flags)) continue;
    if (flags.some((f) => f.level === "warn" && f.kind === "diet")) continue;

    // Stage 2: score by goal overlap; only keep positive matches.
    const score = scoreProductForPatient(product, attributes);
    if (score <= 0) continue;

    const productConcerns = product.tags.filter((t) => t.tagType === "concern").map((t) => norm(t.label));
    const productDiets = product.tags.filter((t) => t.tagType === "diet").map((t) => norm(t.label));
    const reasons: string[] = [];
    for (const goal of goalLabels) {
      if (productConcerns.includes(goal)) reasons.push(`targets ${goal}`);
    }
    reasons.push("allergy-safe");
    for (const diet of dietLabels) {
      if (productDiets.includes(diet)) reasons.push(`${diet}-friendly`);
    }
    suggestions.push({ product, score, reasons });
  }

  suggestions.sort((a, b) => (b.score - a.score) || a.product.name.localeCompare(b.product.name));
  return suggestions.slice(0, limit);
}
