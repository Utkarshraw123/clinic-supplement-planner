import { query, execute } from "@/lib/db";

export type SnippetCategory = "supplement" | "lifestyle" | "dietary" | "general";
export type NoteSnippet = { id: number; text: string; category: SnippetCategory };

// List reusable snippets, optionally filtered to one category. Rows with no category
// (older data) are treated as "supplement" so existing supplement notes keep showing.
export async function listSnippets(category?: SnippetCategory): Promise<NoteSnippet[]> {
  const rows = await query<{ id: number; text: string; category: string | null }>(
    "SELECT id, text, category FROM note_snippets ORDER BY text"
  );
  const mapped = rows.map((r) => ({ id: r.id, text: r.text, category: (r.category ?? "supplement") as SnippetCategory }));
  return category ? mapped.filter((s) => s.category === category) : mapped;
}

export async function createSnippet(text: string, category: SnippetCategory = "supplement", createdBy?: number): Promise<number> {
  const rs = await execute(
    "INSERT INTO note_snippets (text, category, created_by) VALUES (?, ?, ?)",
    [text.trim(), category, createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function deleteSnippet(id: number): Promise<void> {
  await execute("DELETE FROM note_snippets WHERE id = ?", [id]);
}
