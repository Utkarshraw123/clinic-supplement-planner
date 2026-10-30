import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type NoteInput = {
  noteDate: string; title?: string; body?: string;
  subjective?: string; objective?: string; assessment?: string; plan?: string;
  authorId?: number;
};

export type NoteRow = {
  id: number; patient_id: number; note_date: string;
  title: string | null; body: string | null;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null;
  author_id: number | null; created_at: string; updated_at: string;
};

const norm = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function createNote(patientId: number, input: NoteInput): Promise<number> {
  const rs = await execute(
    `INSERT INTO consultation_notes (patient_id, note_date, title, body, subjective, objective, assessment, plan, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, input.noteDate.trim(), norm(input.title), norm(input.body), norm(input.subjective), norm(input.objective), norm(input.assessment), norm(input.plan), input.authorId ?? null]
  );
  const id = Number(rs.lastInsertRowid);
  await recordAudit({ actorId: input.authorId, action: "note_added", entity: "patient", entityId: patientId, detail: `note ${id} (${input.noteDate.trim()})` });
  return id;
}

export async function updateNote(noteId: number, input: NoteInput): Promise<void> {
  await execute(
    `UPDATE consultation_notes SET note_date = ?, title = ?, body = ?, subjective = ?, objective = ?, assessment = ?, plan = ?, updated_at = datetime('now') WHERE id = ?`,
    [input.noteDate.trim(), norm(input.title), norm(input.body), norm(input.subjective), norm(input.objective), norm(input.assessment), norm(input.plan), noteId]
  );
  const row = (await query<{ patient_id: number }>("SELECT patient_id FROM consultation_notes WHERE id = ?", [noteId]))[0];
  if (row) await recordAudit({ actorId: input.authorId, action: "note_updated", entity: "patient", entityId: row.patient_id, detail: `note ${noteId}` });
}

export async function getNote(noteId: number): Promise<NoteRow | null> {
  const rows = await query<NoteRow>("SELECT * FROM consultation_notes WHERE id = ?", [noteId]);
  return rows[0] ?? null;
}

export async function listNotesForPatient(patientId: number): Promise<NoteRow[]> {
  return query<NoteRow>("SELECT * FROM consultation_notes WHERE patient_id = ? ORDER BY note_date DESC, id DESC", [patientId]);
}

export async function deleteNote(noteId: number, actorId?: number): Promise<void> {
  const row = (await query<{ patient_id: number }>("SELECT patient_id FROM consultation_notes WHERE id = ?", [noteId]))[0];
  await execute("DELETE FROM consultation_notes WHERE id = ?", [noteId]);
  if (row) await recordAudit({ actorId, action: "note_erased", entity: "patient", entityId: row.patient_id, detail: `note ${noteId}` });
}
