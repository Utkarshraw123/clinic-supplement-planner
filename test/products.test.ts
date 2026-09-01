import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { addTerm } from "@/lib/taxonomies";
import * as P from "@/lib/products";

describe("products", () => {
  let brandId = 0;
  beforeAll(async () => { await runMigrations(); brandId = await createBrand({ name: `Wild ${Date.now()}` }); });

  it("creates a product with tags, suppliers, and a symmetric alternative", async () => {
    const capId = await P.createProduct({ brandId, name: "Food-Grown Magnesium", packageSize: "60 caps", form: "capsule" });
    const oilId = await P.createProduct({ brandId, name: "Magnesium Liquid", packageSize: "100ml", form: "liquid" });

    const mushroom = await addTerm("allergen", "mushroom");
    const sleep = await addTerm("concern", "sleep");
    await P.setProductTags(capId, [{ termId: mushroom, tagType: "allergen" }, { termId: sleep, tagType: "concern" }]);

    await P.addSupplierLink(capId, "Wild Nutrition", "https://wildnutrition.com/x");
    await P.addSupplierLink(capId, "Natural Dispensary", "https://naturaldispensary.co.uk/x");
    await P.linkAlternative(capId, oilId);

    const detail = await P.getProduct(capId);
    expect(detail!.name).toBe("Food-Grown Magnesium");
    expect(detail!.tags.map((t) => t.label).sort()).toEqual(["mushroom","sleep"]);
    expect(detail!.suppliers).toHaveLength(2);
    expect(detail!.alternatives.map((a) => a.id)).toContain(oilId);

    const reverse = await P.getProduct(oilId);
    expect(reverse!.alternatives.map((a) => a.id)).toContain(capId);
  });

  it("searches by product or brand name, active only", async () => {
    const hits = await P.searchProducts("Magnesium");
    expect(hits.some((h) => h.name.includes("Magnesium"))).toBe(true);
  });

  it("setProductTags replaces rather than appends", async () => {
    const id = await P.createProduct({ brandId, name: "Replace test", form: "capsule" });
    const a = await addTerm("ingredient", "iron");
    const b = await addTerm("ingredient", "zinc");
    await P.setProductTags(id, [{ termId: a, tagType: "ingredient" }]);
    await P.setProductTags(id, [{ termId: b, tagType: "ingredient" }]);
    const detail = await P.getProduct(id);
    expect(detail!.tags.map((t) => t.label)).toEqual(["zinc"]);
  });

  it("archiveProduct removes the product from the active catalogue and search", async () => {
    const id = await P.createProduct({ brandId, name: `Discontinue me ${Date.now()}`, form: "capsule" });
    const name = (await P.getProduct(id))!.name;

    // present before archiving
    expect((await P.listActiveProductsWithTags()).some((p) => p.id === id)).toBe(true);
    expect((await P.searchProducts(name)).some((h) => h.id === id)).toBe(true);

    await P.archiveProduct(id);

    // gone from the catalogue + plan builder + search, but the row still exists
    expect((await P.listActiveProductsWithTags()).some((p) => p.id === id)).toBe(false);
    expect((await P.searchProducts(name)).some((h) => h.id === id)).toBe(false);
    expect((await P.getProduct(id))!.status).toBe("archived");
  });
});
