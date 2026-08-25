import { query, execute } from "@/lib/db";

export type Brand = { id: number; name: string; website: string|null; logo_url: string|null };

export async function createBrand(input: { name: string; website?: string; logoUrl?: string }): Promise<number> {
  const rs = await execute(
    "INSERT INTO brands (name, website, logo_url) VALUES (?, ?, ?)",
    [input.name.trim(), input.website?.trim() || null, input.logoUrl?.trim() || null]
  );
  return Number(rs.lastInsertRowid);
}

export async function listBrands(): Promise<Brand[]> {
  return query<Brand>("SELECT id, name, website, logo_url FROM brands ORDER BY name");
}

export async function getBrand(id: number): Promise<{ id: number; name: string } | null> {
  const rows = await query<{ id: number; name: string }>("SELECT id, name FROM brands WHERE id = ?", [id]);
  return rows[0] ?? null;
}
