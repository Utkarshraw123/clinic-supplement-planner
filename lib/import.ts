import Papa from "papaparse";
import { createBrand, listBrands } from "@/lib/brands";
import { createProduct } from "@/lib/products";

export type ImportRow = { brand: string; name: string; package_size?: string; form?: string };

export function parseCatalogCsv(csv: string): ImportRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rows: ImportRow[] = [];
  for (const r of parsed.data) {
    const brand = (r["brand"] ?? "").trim();
    const name = (r["name"] ?? "").trim();
    if (!brand || !name) continue;
    rows.push({
      brand,
      name,
      package_size: (r["package_size"] ?? "").trim() || undefined,
      form: (r["form"] ?? "").trim() || undefined,
    });
  }
  return rows;
}

export async function importRows(rows: ImportRow[]): Promise<{ created: number; brandsCreated: number }> {
  const existing = await listBrands();
  const byName = new Map(existing.map((b) => [b.name.toLowerCase(), b.id]));
  let created = 0, brandsCreated = 0;
  for (const row of rows) {
    let brandId = byName.get(row.brand.toLowerCase());
    if (!brandId) { brandId = await createBrand({ name: row.brand }); byName.set(row.brand.toLowerCase(), brandId); brandsCreated++; }
    await createProduct({ brandId, name: row.name, packageSize: row.package_size, form: row.form });
    created++;
  }
  return { created, brandsCreated };
}
