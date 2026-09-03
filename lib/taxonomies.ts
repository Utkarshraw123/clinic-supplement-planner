import { query, execute } from "@/lib/db";

export type TermType = "allergen"|"ingredient"|"concern"|"diet"|"caution";
export type Term = { id: number; type: TermType; label: string };

export async function addTerm(type: TermType, label: string, createdBy?: number): Promise<number> {
  const clean = label.trim();
  await execute(
    "INSERT OR IGNORE INTO taxonomy_terms (type, label, created_by) VALUES (?, ?, ?)",
    [type, clean, createdBy ?? null]
  );
  const rows = await query<{ id: number }>("SELECT id FROM taxonomy_terms WHERE type = ? AND label = ?", [type, clean]);
  return rows[0].id;
}

export async function listTerms(type?: TermType): Promise<Term[]> {
  if (type) return query<Term>("SELECT id, type, label FROM taxonomy_terms WHERE type = ? ORDER BY label", [type]);
  return query<Term>("SELECT id, type, label FROM taxonomy_terms ORDER BY type, label");
}

export type TermUsage = { patients: number; products: number };

// How many patient profiles / product tags currently reference this term.
export async function countTermUsage(id: number): Promise<TermUsage> {
  const [p] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM patient_attributes WHERE taxonomy_term_id = ?", [id]);
  const [q] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM product_tags WHERE taxonomy_term_id = ?", [id]);
  return { patients: Number(p?.n ?? 0), products: Number(q?.n ?? 0) };
}

export async function deleteTerm(id: number): Promise<void> {
  // Foreign keys aren't enforced at runtime, so a plain DELETE would silently orphan
  // any patient profile or product still tagged with this term. Refuse instead, so a
  // term can only be retired once it's genuinely unused.
  const usage = await countTermUsage(id);
  if (usage.patients > 0 || usage.products > 0) {
    const parts = [
      usage.patients > 0 ? `${usage.patients} patient${usage.patients === 1 ? "" : "s"}` : null,
      usage.products > 0 ? `${usage.products} product${usage.products === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" and ");
    throw new Error(`This term is still used by ${parts}. Remove it from them before retiring it.`);
  }
  await execute("DELETE FROM taxonomy_terms WHERE id = ?", [id]);
}
