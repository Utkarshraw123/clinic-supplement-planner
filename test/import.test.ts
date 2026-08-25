import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { parseCatalogCsv, importRows } from "@/lib/import";
import { searchProducts } from "@/lib/products";

describe("csv import", () => {
  beforeAll(async () => { await runMigrations(); });
  it("parses headers case-insensitively and skips blanks", () => {
    const csv = "Brand,Name,Package_Size,Form\nWild Nutrition,Food-Grown Zinc,30 caps,capsule\n,,,\nBare Biology,Life & Soul,60 caps,capsule\n";
    const rows = parseCatalogCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ brand: "Wild Nutrition", name: "Food-Grown Zinc", package_size: "30 caps", form: "capsule" });
  });
  it("imports rows, creating brands as needed", async () => {
    const stamp = Date.now();
    const rows = parseCatalogCsv(`brand,name,form\nImportCo ${stamp},Widget A,capsule\nImportCo ${stamp},Widget B,liquid\n`);
    const result = await importRows(rows);
    expect(result.created).toBe(2);
    expect(result.brandsCreated).toBe(1);
    const hits = await searchProducts(`Widget`);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
