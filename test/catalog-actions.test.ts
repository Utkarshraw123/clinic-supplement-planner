import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { addTerm, listTerms } from "@/lib/taxonomies";
import * as P from "@/lib/products";

// The editor's data contract: it must be able to load a product, brands, and grouped terms.
describe("catalog editor data contract", () => {
  beforeAll(async () => { await runMigrations(); });
  it("provides everything the editor needs", async () => {
    const brandId = await createBrand({ name: `Bare ${Date.now()}` });
    const id = await P.createProduct({ brandId, name: "Omega-3 Vegan", form: "capsule" });
    await addTerm("diet", "vegan");
    const detail = await P.getProduct(id);
    const diets = await listTerms("diet");
    expect(detail).not.toBeNull();
    expect(diets.some((d) => d.label === "vegan")).toBe(true);
  });
});
