import { describe, it, expect } from "vitest";
import { extractKnownTerms } from "@/lib/enrich";

const terms = [
  { id: 1, label: "mushroom", type: "allergen" },
  { id: 2, label: "magnesium", type: "ingredient" },
  { id: 3, label: "vitamin d", type: "ingredient" },
  { id: 4, label: "soy", type: "allergen" },
  { id: 5, label: "energy", type: "concern" },
];

describe("extractKnownTerms", () => {
  it("finds ingredient and allergen terms present in the text, case-insensitively", () => {
    const text = "Contains Magnesium and Vitamin D. Suitable for those avoiding Soy.";
    const found = extractKnownTerms(text, terms).map((t) => t.label).sort();
    expect(found).toEqual(["magnesium", "soy", "vitamin d"]);
  });

  it("never scans non ingredient/allergen types", () => {
    const text = "Great for energy and vitality.";
    expect(extractKnownTerms(text, terms).map((t) => t.label)).not.toContain("energy");
  });

  it("matches on word boundaries, not substrings", () => {
    const text = "This soybean-free formula lists no allergens.";
    expect(extractKnownTerms(text, terms).map((t) => t.label)).not.toContain("soy");
  });

  it("dedupes repeated mentions", () => {
    const text = "Magnesium, magnesium, MAGNESIUM.";
    expect(extractKnownTerms(text, terms).filter((t) => t.label === "magnesium")).toHaveLength(1);
  });
});
