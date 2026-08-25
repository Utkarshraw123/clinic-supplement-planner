import { describe, it, expect } from "vitest";
import { extractProductName, extractPackageSize, extractForm, extractAllKnownTerms, parseProductHtml } from "@/lib/enrich";

const TERMS = [
  { id: 1, label: "magnesium", type: "ingredient" },
  { id: 2, label: "mushroom", type: "allergen" },
  { id: 3, label: "soya", type: "allergen" },
  { id: 4, label: "sleep", type: "concern" },
  { id: 5, label: "vegan", type: "diet" },
];

describe("product page parsing", () => {
  it("prefers og:title and strips a trailing brand suffix", () => {
    const html = `<meta property="og:title" content="Food-Grown Magnesium | Wild Nutrition" />`;
    expect(extractProductName(html)).toBe("Food-Grown Magnesium");
  });

  it("falls back to <title> when no og:title", () => {
    const html = `<title>Sleep Support Complex – Some Shop</title>`;
    expect(extractProductName(html)).toBe("Sleep Support Complex");
  });

  it("normalises package size and detects form", () => {
    const text = "A bottle of 60 caps, take one softgel daily";
    expect(extractPackageSize(text)).toBe("60 capsules");
    expect(extractForm(text)).toBe("softgel");
  });

  it("matches known terms of every type, including allergens", () => {
    const text = "Contains magnesium and mushroom extract. Suitable for a vegan diet. Supports sleep.";
    const hits = extractAllKnownTerms(text, TERMS).map((t) => t.label).sort();
    expect(hits).toEqual(["magnesium", "mushroom", "sleep", "vegan"]);
  });

  it("parses a full HTML document into a form pre-fill including allergens", () => {
    const html = `
      <title>Food-Grown Magnesium | Wild Nutrition</title>
      <div>60 capsules. Contains magnesium. May contain soya. Supports sleep.</div>`;
    const out = parseProductHtml(html, TERMS);
    expect(out.name).toBe("Food-Grown Magnesium");
    expect(out.packageSize).toBe("60 capsules");
    expect(out.form).toBe("capsule");
    const allergens = out.terms.filter((t) => t.type === "allergen").map((t) => t.label);
    expect(allergens).toContain("soya");
  });
});
