import { getCurrentUser } from "@/lib/auth/current-user";
import { query } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

type Row = {
  id: number; name: string; brand_name: string; package_size: string | null;
  form: string | null; status: string; allergens: string | null; ingredients: string | null;
};

export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  // One row per product with allergen/ingredient tags rolled up (comma-joined).
  const rows = await query<Row>(
    `SELECT p.id, p.name, b.name AS brand_name, p.package_size, p.form, p.status,
       (SELECT GROUP_CONCAT(t.label, '; ') FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id
          WHERE pt.product_id = p.id AND pt.tag_type = 'allergen') AS allergens,
       (SELECT GROUP_CONCAT(t.label, '; ') FROM product_tags pt JOIN taxonomy_terms t ON t.id = pt.taxonomy_term_id
          WHERE pt.product_id = p.id AND pt.tag_type = 'ingredient') AS ingredients
     FROM products p JOIN brands b ON b.id = p.brand_id
     ORDER BY b.name, p.name`
  );
  const csv = toCsv(rows, [
    { header: "ID", value: (r) => r.id },
    { header: "Brand", value: (r) => r.brand_name },
    { header: "Product", value: (r) => r.name },
    { header: "Package size", value: (r) => r.package_size },
    { header: "Form", value: (r) => r.form },
    { header: "Status", value: (r) => r.status },
    { header: "Allergens", value: (r) => r.allergens },
    { header: "Ingredients", value: (r) => r.ingredients },
  ]);
  return csvResponse(csv, `catalog-${new Date().toISOString().slice(0, 10)}.csv`);
}
