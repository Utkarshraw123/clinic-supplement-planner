import { query, execute } from "@/lib/db";
import type { TermType } from "@/lib/taxonomies";

export type ProductInput = { brandId: number; name: string; packageSize?: string; form?: string };
export type ProductDetail = {
  id: number; brand_id: number; brand_name: string; name: string;
  package_size: string|null; form: string|null; status: string;
  tags: { termId: number; label: string; tagType: TermType }[];
  suppliers: { id: number; label: string; url: string }[];
  alternatives: { id: number; name: string }[];
};

export async function createProduct(input: ProductInput): Promise<number> {
  const rs = await execute(
    "INSERT INTO products (brand_id, name, package_size, form) VALUES (?, ?, ?, ?)",
    [input.brandId, input.name.trim(), input.packageSize?.trim() || null, input.form?.trim() || null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await execute(
    "UPDATE products SET brand_id = ?, name = ?, package_size = ?, form = ? WHERE id = ?",
    [input.brandId, input.name.trim(), input.packageSize?.trim() || null, input.form?.trim() || null, id]
  );
}

export async function archiveProduct(id: number): Promise<void> {
  await execute("UPDATE products SET status = 'archived' WHERE id = ?", [id]);
}

export async function setProductTags(productId: number, tags: { termId: number; tagType: TermType }[]): Promise<void> {
  await execute("DELETE FROM product_tags WHERE product_id = ?", [productId]);
  for (const t of tags) {
    await execute(
      "INSERT OR IGNORE INTO product_tags (product_id, taxonomy_term_id, tag_type) VALUES (?, ?, ?)",
      [productId, t.termId, t.tagType]
    );
  }
}

export async function addSupplierLink(productId: number, label: string, url: string): Promise<number> {
  const rs = await execute(
    "INSERT INTO supplier_links (product_id, label, url) VALUES (?, ?, ?)",
    [productId, label.trim(), url.trim()]
  );
  return Number(rs.lastInsertRowid);
}

export async function removeSupplierLink(linkId: number): Promise<void> {
  await execute("DELETE FROM supplier_links WHERE id = ?", [linkId]);
}

export async function linkAlternative(productId: number, altId: number): Promise<void> {
  await execute("INSERT OR IGNORE INTO product_alternatives (product_id, alternative_product_id) VALUES (?, ?)", [productId, altId]);
  await execute("INSERT OR IGNORE INTO product_alternatives (product_id, alternative_product_id) VALUES (?, ?)", [altId, productId]);
}

export async function getProduct(id: number): Promise<ProductDetail | null> {
  const base = await query<Omit<ProductDetail,"tags"|"suppliers"|"alternatives">>(
    `SELECT p.id, p.brand_id, b.name AS brand_name, p.name, p.package_size, p.form, p.status
     FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id = ?`, [id]
  );
  if (!base[0]) return null;
  const tags = await query<{ termId: number; label: string; tagType: TermType }>(
    `SELECT t.id AS termId, t.label AS label, pt.tag_type AS tagType
     FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id WHERE pt.product_id = ?`, [id]
  );
  const suppliers = await query<{ id: number; label: string; url: string }>(
    "SELECT id, label, url FROM supplier_links WHERE product_id = ?", [id]
  );
  const alternatives = await query<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM product_alternatives a JOIN products p ON p.id = a.alternative_product_id WHERE a.product_id = ?`, [id]
  );
  return { ...base[0], tags, suppliers, alternatives };
}

export async function searchProducts(term: string): Promise<{ id: number; name: string; brand_name: string; form: string|null; package_size: string|null }[]> {
  const like = `%${term.trim()}%`;
  return query(
    `SELECT p.id, p.name, b.name AS brand_name, p.form, p.package_size
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.status = 'active' AND (p.name LIKE ? OR b.name LIKE ?)
     ORDER BY b.name, p.name`, [like, like]
  );
}
