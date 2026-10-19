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

// Resolve a brand by name (case-insensitive), creating it if it doesn't exist yet.
// Lets the product form accept an existing brand OR a brand-new one typed inline.
export async function findOrCreateBrand(name: string): Promise<number> {
  const clean = name.trim();
  if (!clean) throw new Error("Brand name is required");
  const existing = await query<{ id: number }>("SELECT id FROM brands WHERE lower(name) = lower(?)", [clean]);
  if (existing[0]) return existing[0].id;
  return createBrand({ name: clean });
}

export async function getBrand(id: number): Promise<{ id: number; name: string } | null> {
  const rows = await query<{ id: number; name: string }>("SELECT id, name FROM brands WHERE id = ?", [id]);
  return rows[0] ?? null;
}
