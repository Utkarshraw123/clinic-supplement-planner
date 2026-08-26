/**
 * Seed the catalogue with Wild Nutrition's full individual-supplement range.
 *
 * Data source: scripts/data/wild-nutrition.json — derived from wildnutrition.com's
 * public product data (names, forms, pack sizes, product links) plus per-product
 * ingredient lists scraped from each product page. Mapping into this platform's
 * taxonomies:
 *   - filter-diet        -> diet     (suitability; soft-warns only)
 *   - filter-health need -> concern  (drives ranked suggestions; never blocks)
 *   - active nutrients   -> ingredient (participates in the hard allergy block)
 *   - "contains" items   -> allergen  (HARD block on a patient allergy match)
 *
 * SAFETY NOTE: allergen tags are auto-derived from ingredient lists and must be
 * treated as a practitioner-confirmed suggestion, not gospel — verify per product.
 * They cover only what appears in the ingredient text (fish, gluten, mushroom here);
 * they are NOT a substitute for reading the label.
 *
 * Idempotent: re-running skips products whose name already exists for the brand,
 * and taxonomy terms use INSERT OR IGNORE. Run with:  npx tsx scripts/seed-wild-nutrition.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "@/scripts/migrate";
import { findOrCreateBrand } from "@/lib/brands";
import { createProduct, setProductTags, addSupplierLink } from "@/lib/products";
import { addTerm, type TermType } from "@/lib/taxonomies";
import { query, execute } from "@/lib/db";

type SeedProduct = {
  name: string;
  description: string;
  packageSize: string | null;
  form: string | null;
  url: string;
  diet: string[];
  concern: string[];
  ingredients: string[];
  allergens: string[];
};

const BRAND = "Wild Nutrition";
const BRAND_SITE = "https://www.wildnutrition.com";

async function main() {
  await runMigrations();

  const file = join(process.cwd(), "scripts", "data", "wild-nutrition.json");
  const products: SeedProduct[] = JSON.parse(readFileSync(file, "utf8"));

  const brandId = await findOrCreateBrand(BRAND);
  await execute("UPDATE brands SET website = ? WHERE id = ? AND (website IS NULL OR website = '')", [BRAND_SITE, brandId]);

  // Existing product names for this brand — so re-runs don't duplicate.
  const existing = new Set(
    (await query<{ name: string }>("SELECT name FROM products WHERE brand_id = ?", [brandId]))
      .map((r) => r.name.trim().toLowerCase())
  );

  // Cache taxonomy term ids so we resolve each (type,label) only once.
  const termCache = new Map<string, number>();
  const term = async (type: TermType, label: string): Promise<number> => {
    const key = `${type}:${label.toLowerCase()}`;
    let id = termCache.get(key);
    if (id === undefined) { id = await addTerm(type, label); termCache.set(key, id); }
    return id;
  };

  let created = 0, skipped = 0;
  for (const p of products) {
    if (existing.has(p.name.trim().toLowerCase())) { skipped++; continue; }

    const productId = await createProduct({
      brandId,
      name: p.name,
      description: p.description || undefined,
      packageSize: p.packageSize || undefined,
      form: p.form || undefined,
    });

    const tags: { termId: number; tagType: TermType }[] = [];
    for (const d of p.diet) tags.push({ termId: await term("diet", d), tagType: "diet" });
    for (const c of p.concern) tags.push({ termId: await term("concern", c), tagType: "concern" });
    for (const i of p.ingredients) tags.push({ termId: await term("ingredient", i), tagType: "ingredient" });
    for (const a of p.allergens) tags.push({ termId: await term("allergen", a), tagType: "allergen" });
    await setProductTags(productId, tags);

    if (p.url) await addSupplierLink(productId, BRAND, p.url);
    created++;
  }

  const total = (await query<{ n: number }>("SELECT COUNT(*) n FROM products WHERE brand_id = ?", [brandId]))[0].n;
  console.log(`Wild Nutrition seed: created ${created}, skipped ${skipped} (already present). Brand now has ${total} products.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
