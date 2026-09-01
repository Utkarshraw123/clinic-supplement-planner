/**
 * Seed the catalogue with a CURATED selection of the Cytoplan range.
 *
 * NOT the whole 177-product Cytoplan catalogue — a clinically-curated shortlist
 * (84 products) chosen to fit Lorna Driver-Davies's practice: women's hormonal
 * health (peri/menopause, cycle, fertility, pregnancy, PCOS), gut health, the
 * nervous system / stress / sleep, energy & methylation, thyroid, foundational
 * multivitamins & minerals, detox/liver, immunity, skin, and blood-sugar support.
 * Deliberately EXCLUDED: pet products, books/guides, kits, marketing bundles,
 * paediatric-only lines, male-reproductive products, and osteoarthritis/joint
 * and niche cardiovascular items outside her core scope.
 *
 * Data source: scripts/data/cytoplan.json — scraped from cytoplan.co.uk product
 * pages (JSON-LD name/price/SKU + the on-page description). Tags were derived by
 * keyword-matching the description against this platform's controlled vocabulary:
 *   - filter/plant diet -> diet     (suitability; soft-warns only)
 *   - health need       -> concern  (drives ranked suggestions; never blocks)
 *   - named nutrients   -> ingredient
 *   - "contains" items  -> allergen  (HARD block on a patient allergy match)
 *
 * ⚠️ CLINICAL SAFETY: the allergen tags are AUTO-DERIVED and MUST be reviewed and
 * signed off by Lorna before they gate real plans (same policy as the Wild
 * Nutrition allergen sign-off). Current auto-derived allergen tags:
 *   Menopause Support -> soya (soy isoflavones)
 *   CytoProtect GI Tract -> milk (lactoferrin, bovine-milk derived)
 *   Fish Oil Capsules -> fish
 *   Krill Oil -> shellfish (Antarctic krill = crustacean)
 *   Marine Collagen -> fish (whitefish)
 *   Organic Lion's Mane -> mushroom (Hericium erinaceus)
 * Note: Cytoplan "Food State" nutrients are grown on a Lactobacillus/yeast base —
 * verify each product label for trace milk/soya before relying on the tags.
 *
 * Idempotent: re-running skips products whose name already exists for the brand,
 * and taxonomy terms use INSERT OR IGNORE. Run LOCAL first, review, then prod:
 *   npx tsx scripts/seed-cytoplan.ts
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
  price?: number | string; // reference only — no price column, ignored on insert
  sku?: string;            // reference only — ignored on insert
  diet: string[];
  concern: string[];
  ingredients: string[];
  allergens: string[];
};

const BRAND = "Cytoplan";
const BRAND_SITE = "https://www.cytoplan.co.uk";

async function main() {
  await runMigrations();

  const file = join(process.cwd(), "scripts", "data", "cytoplan.json");
  const products: SeedProduct[] = JSON.parse(readFileSync(file, "utf8"));

  const brandId = await findOrCreateBrand(BRAND);
  await execute(
    "UPDATE brands SET website = ? WHERE id = ? AND (website IS NULL OR website = '')",
    [BRAND_SITE, brandId]
  );

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
  console.log(`Cytoplan seed: created ${created}, skipped ${skipped} (already present). Brand now has ${total} products.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
