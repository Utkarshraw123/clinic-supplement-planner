import { query, execute } from "@/lib/db";

export type BrandCode = { id: number; brandId: number; code: string; isDefault: boolean };

type Row = { id: number; brand_id: number; code: string; is_default: number };
const toCode = (r: Row): BrandCode => ({ id: r.id, brandId: r.brand_id, code: r.code, isDefault: r.is_default === 1 });

export async function listBrandCodes(brandId: number): Promise<BrandCode[]> {
  const rows = await query<Row>("SELECT id, brand_id, code, is_default FROM brand_codes WHERE brand_id = ? ORDER BY code", [brandId]);
  return rows.map(toCode);
}

// Every brand's codes in one query, keyed by brand id (for pages that show many brands).
export async function listAllBrandCodes(): Promise<Map<number, BrandCode[]>> {
  const rows = await query<Row>("SELECT id, brand_id, code, is_default FROM brand_codes ORDER BY code");
  const map = new Map<number, BrandCode[]>();
  for (const r of rows) {
    const list = map.get(r.brand_id) ?? [];
    list.push(toCode(r));
    map.set(r.brand_id, list);
  }
  return map;
}

export async function addBrandCode(brandId: number, code: string, makeDefault = false): Promise<void> {
  const c = code.trim();
  if (!c) return;
  await execute("INSERT OR IGNORE INTO brand_codes (brand_id, code) VALUES (?, ?)", [brandId, c]);
  if (makeDefault) {
    const rows = await query<{ id: number }>("SELECT id FROM brand_codes WHERE brand_id = ? AND code = ?", [brandId, c]);
    if (rows[0]) await setDefaultBrandCode(rows[0].id);
  }
}

export async function deleteBrandCode(id: number): Promise<void> {
  await execute("DELETE FROM brand_codes WHERE id = ?", [id]);
}

// Make one code the brand's default, clearing any other default for that brand.
export async function setDefaultBrandCode(codeId: number): Promise<void> {
  const rows = await query<{ brand_id: number }>("SELECT brand_id FROM brand_codes WHERE id = ?", [codeId]);
  if (!rows[0]) return;
  await execute("UPDATE brand_codes SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE brand_id = ?", [codeId, rows[0].brand_id]);
}

export async function clearDefaultBrandCode(brandId: number): Promise<void> {
  await execute("UPDATE brand_codes SET is_default = 0 WHERE brand_id = ?", [brandId]);
}
