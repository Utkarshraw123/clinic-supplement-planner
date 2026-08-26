import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type SeedProduct = {
  name: string; description: string; packageSize: string | null; form: string | null;
  url: string; diet: string[]; concern: string[]; ingredients: string[]; allergens: string[];
};

const data: SeedProduct[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "data", "wild-nutrition.json"), "utf8")
);

// Auto-derived allergens must stay within the set we can defend from the ingredient text.
// A new value slipping in usually means a mis-parse — fail loudly so it gets reviewed.
const ALLOWED_ALLERGENS = new Set([
  "fish", "crustaceans", "molluscs", "soya", "milk", "egg", "gluten",
  "sesame", "peanut", "tree nuts", "celery", "mustard", "lupin", "sulphites", "mushroom",
]);

describe("Wild Nutrition seed data", () => {
  it("has a full, non-trivial catalogue", () => {
    expect(data.length).toBeGreaterThanOrEqual(40);
  });

  it("every product has a name, a wildnutrition.com link, and array tag fields", () => {
    for (const p of data) {
      expect(p.name.trim()).not.toBe("");
      expect(p.url).toMatch(/^https:\/\/www\.wildnutrition\.com\/products\//);
      for (const key of ["diet", "concern", "ingredients", "allergens"] as const) {
        expect(Array.isArray(p[key]), `${p.name}.${key} should be an array`).toBe(true);
      }
    }
  });

  it("has no duplicate product names", () => {
    const names = data.map((p) => p.name.trim().toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("only uses defensible auto-derived allergen labels", () => {
    for (const p of data) {
      for (const a of p.allergens) {
        expect(ALLOWED_ALLERGENS.has(a), `${p.name} has unexpected allergen "${a}"`).toBe(true);
      }
    }
  });

  it("known fish-oil and mushroom products carry the expected allergen flag", () => {
    const omega = data.find((p) => p.name === "Pure Strength Omega 3");
    expect(omega?.allergens).toContain("fish");
    const lionsMane = data.find((p) => p.name === "Lion's Mane Plus");
    expect(lionsMane?.allergens).toContain("mushroom");
  });
});
