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

export async function deleteTerm(id: number): Promise<void> {
  await execute("DELETE FROM taxonomy_terms WHERE id = ?", [id]);
}
