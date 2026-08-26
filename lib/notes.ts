import { query, execute } from "@/lib/db";

export type NoteSnippet = { id: number; text: string };

export async function listSnippets(): Promise<NoteSnippet[]> {
  return query<NoteSnippet>("SELECT id, text FROM note_snippets ORDER BY text");
}

export async function createSnippet(text: string, createdBy?: number): Promise<number> {
  const rs = await execute(
    "INSERT INTO note_snippets (text, created_by) VALUES (?, ?)",
    [text.trim(), createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function deleteSnippet(id: number): Promise<void> {
  await execute("DELETE FROM note_snippets WHERE id = ?", [id]);
}
