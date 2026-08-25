import { runMigrations } from "@/scripts/migrate";
import { parseCatalogCsv, importRows } from "@/lib/import";
import { addTerm } from "@/lib/taxonomies";
import { searchProducts, setProductTags, addSupplierLink } from "@/lib/products";

async function main() {
  await runMigrations();
  const csv = `brand,name,package_size,form
Wild Nutrition,Food-Grown Magnesium,60 capsules,capsule
Wild Nutrition,Food-Grown Vitamin D,30 capsules,capsule
Bare Biology,Life & Soul Omega-3,60 capsules,capsule
Bare Biology,Life & Soul Omega-3 Liquid,150ml,liquid`;
  const res = await importRows(parseCatalogCsv(csv));
  const mushroom = await addTerm("allergen", "mushroom");
  const sleep = await addTerm("concern", "sleep");
  const mag = (await searchProducts("Magnesium"))[0];
  if (mag) {
    await setProductTags(mag.id, [{ termId: mushroom, tagType: "allergen" }, { termId: sleep, tagType: "concern" }]);
    await addSupplierLink(mag.id, "Wild Nutrition", "https://wildnutrition.com/magnesium");
    await addSupplierLink(mag.id, "Natural Dispensary", "https://naturaldispensary.co.uk/magnesium");
  }
  console.log("demo import:", res, "products now:", (await searchProducts("")).length);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
