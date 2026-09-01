import { query, execute } from "@/lib/db";
import type { TermType } from "@/lib/taxonomies";

export type ProductInput = { brandId: number; name: string; description?: string; packageSize?: string; form?: string; defaultNote?: string };
export type ProductDetail = {
  id: number; brand_id: number; brand_name: string; brand_promo_code: string|null; name: string; description: string|null;
  package_size: string|null; form: string|null; default_note: string|null; status: string;
  tags: { termId: number; label: string; tagType: TermType }[];
  suppliers: { id: number; label: string; url: string }[];
  alternatives: { id: number; name: string }[];
};

export async function createProduct(input: ProductInput): Promise<number> {
  const rs = await execute(
    "INSERT INTO products (brand_id, name, description, package_size, form, default_note) VALUES (?, ?, ?, ?, ?, ?)",
    [input.brandId, input.name.trim(), input.description?.trim() || null, input.packageSize?.trim() || null, input.form?.trim() || null, input.defaultNote?.trim() || null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await execute(
    "UPDATE products SET brand_id = ?, name = ?, description = ?, package_size = ?, form = ?, default_note = ? WHERE id = ?",
    [input.brandId, input.name.trim(), input.description?.trim() || null, input.packageSize?.trim() || null, input.form?.trim() || null, input.defaultNote?.trim() || null, id]
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
    `SELECT p.id, p.brand_id, b.name AS brand_name, b.promo_code AS brand_promo_code, p.name, p.description, p.package_size, p.form, p.default_note, p.status
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

// Batched load of every active product WITH its tags in 2 queries (not N×getProduct).
// Suppliers/alternatives are left empty — callers that only need tags (flagging,
// recommendations, the plan-builder catalog list) use this to avoid ~4 queries per product.
export async function listActiveProductsWithTags(): Promise<ProductDetail[]> {
  const base = await query<Omit<ProductDetail, "tags"|"suppliers"|"alternatives">>(
    `SELECT p.id, p.brand_id, b.name AS brand_name, b.promo_code AS brand_promo_code, p.name, p.description, p.package_size, p.form, p.default_note, p.status
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.status = 'active' ORDER BY b.name, p.name`
  );
  const tagRows = await query<{ product_id: number; termId: number; label: string; tagType: TermType }>(
    `SELECT pt.product_id, t.id AS termId, t.label AS label, pt.tag_type AS tagType
     FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id
     JOIN products p ON p.id = pt.product_id WHERE p.status = 'active'`
  );
  const byProduct = new Map<number, { termId: number; label: string; tagType: TermType }[]>();
  for (const r of tagRows) {
    const list = byProduct.get(r.product_id) ?? [];
    list.push({ termId: r.termId, label: r.label, tagType: r.tagType });
    byProduct.set(r.product_id, list);
  }
  return base.map((b) => ({ ...b, tags: byProduct.get(b.id) ?? [], suppliers: [], alternatives: [] }));
}

// Batch-load full ProductDetail (tags + suppliers + alternatives) for many ids in
// 4 parallel queries — replaces N× getProduct() in hot paths like getPlan().
export async function getProductsByIds(ids: number[]): Promise<Map<number, ProductDetail>> {
  const map = new Map<number, ProductDetail>();
  if (ids.length === 0) return map;
  const ph = ids.map(() => "?").join(",");
  const [base, tags, suppliers, alternatives] = await Promise.all([
    query<Omit<ProductDetail,"tags"|"suppliers"|"alternatives">>(
      `SELECT p.id, p.brand_id, b.name AS brand_name, b.promo_code AS brand_promo_code, p.name, p.description, p.package_size, p.form, p.default_note, p.status
       FROM products p JOIN brands b ON b.id = p.brand_id WHERE p.id IN (${ph})`, ids),
    query<{ product_id: number; termId: number; label: string; tagType: TermType }>(
      `SELECT pt.product_id, t.id AS termId, t.label AS label, pt.tag_type AS tagType
       FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id WHERE pt.product_id IN (${ph})`, ids),
    query<{ product_id: number; id: number; label: string; url: string }>(
      `SELECT product_id, id, label, url FROM supplier_links WHERE product_id IN (${ph})`, ids),
    query<{ product_id: number; id: number; name: string }>(
      `SELECT a.product_id, p.id, p.name FROM product_alternatives a JOIN products p ON p.id = a.alternative_product_id WHERE a.product_id IN (${ph})`, ids),
  ]);
  for (const b of base) map.set(b.id, { ...b, tags: [], suppliers: [], alternatives: [] });
  for (const t of tags) map.get(t.product_id)?.tags.push({ termId: t.termId, label: t.label, tagType: t.tagType });
  for (const sup of suppliers) map.get(sup.product_id)?.suppliers.push({ id: sup.id, label: sup.label, url: sup.url });
  for (const a of alternatives) map.get(a.product_id)?.alternatives.push({ id: a.id, name: a.name });
  return map;
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
