import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, getProductsByIds } from "@/lib/products";
import { execute, query } from "@/lib/db";
import { listBrandCodes, addBrandCode, deleteBrandCode, setDefaultBrandCode, clearDefaultBrandCode } from "@/lib/brand-codes";

describe("brand codes", () => {
  beforeAll(async () => { await runMigrations(); });

  it("adds codes per brand, ignoring duplicates and blanks", async () => {
    const brandId = await createBrand({ name: `Codes ${Date.now()}` });
    await addBrandCode(brandId, " WN10 ");
    await addBrandCode(brandId, "WN10");
    await addBrandCode(brandId, "  ");
    await addBrandCode(brandId, "WN15");
    expect((await listBrandCodes(brandId)).map((c) => c.code)).toEqual(["WN10", "WN15"]);
  });

  it("keeps at most one default per brand and exposes it as the product's brand code", async () => {
    const brandId = await createBrand({ name: `Default ${Date.now()}` });
    await addBrandCode(brandId, "A10", true);
    await addBrandCode(brandId, "B20", true);
    const codes = await listBrandCodes(brandId);
    expect(codes.filter((c) => c.isDefault).map((c) => c.code)).toEqual(["B20"]);

    const pid = await createProduct({ brandId, name: "Default Mag", form: "capsule" });
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBe("B20");

    await setDefaultBrandCode(codes.find((c) => c.code === "A10")!.id);
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBe("A10");

    await clearDefaultBrandCode(brandId);
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBeNull();
  });

  it("deletes a code", async () => {
    const brandId = await createBrand({ name: `Delete ${Date.now()}` });
    await addBrandCode(brandId, "GONE");
    const [c] = await listBrandCodes(brandId);
    await deleteBrandCode(c.id);
    expect(await listBrandCodes(brandId)).toEqual([]);
  });

  it("migration moves a legacy brand promo code into the list as the default, once", async () => {
    const brandId = await createBrand({ name: `Legacy ${Date.now()}` });
    await execute("UPDATE brands SET promo_code = ? WHERE id = ?", ["OLD5", brandId]);
    await runMigrations();
    expect(await listBrandCodes(brandId)).toMatchObject([{ code: "OLD5", isDefault: true }]);
    const [b] = await query<{ promo_code: string | null }>("SELECT promo_code FROM brands WHERE id = ?", [brandId]);
    expect(b.promo_code).toBeNull();
    // Deleting every code and re-running migrations must not bring the old code back.
    for (const c of await listBrandCodes(brandId)) await deleteBrandCode(c.id);
    await runMigrations();
    expect(await listBrandCodes(brandId)).toEqual([]);
  });
});
