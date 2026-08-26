import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { findOrCreateBrand, createBrand } from "@/lib/brands";
import { createProduct, getProduct } from "@/lib/products";

describe("product fields: brand find-or-create + description", () => {
  beforeAll(async () => { await runMigrations(); });

  it("reuses an existing brand (case-insensitive) and creates new ones", async () => {
    const name = `Acme ${Date.now()}`;
    const id = await createBrand({ name });
    expect(await findOrCreateBrand(name.toUpperCase())).toBe(id); // case-insensitive match
    const fresh = `Zeta ${Date.now()}`;
    const newId = await findOrCreateBrand(fresh);
    expect(newId).not.toBe(id);
    expect(await findOrCreateBrand(fresh)).toBe(newId); // second call reuses
  });

  it("stores and returns a product description", async () => {
    const brandId = await createBrand({ name: `Desc ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "Desc Magnesium", description: "Supports sleep & muscle relaxation" });
    const p = await getProduct(pid);
    expect(p!.description).toBe("Supports sleep & muscle relaxation");
  });
});
