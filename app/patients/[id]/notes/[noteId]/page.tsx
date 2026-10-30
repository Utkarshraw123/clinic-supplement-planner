import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getNote } from "@/lib/consultation-notes";
import NoteForm from "../NoteForm";
import { updateNoteAction } from "../actions";

export default async function EditNotePage({ params }: { params: { id: string; noteId: string } }) {
  await requireUser();
  const id = Number(params.id);
  const noteId = Number(params.noteId);
  const [patient, note] = await Promise.all([getPatient(id), getNote(noteId)]);
  if (!patient || !note || note.patient_id !== id) notFound();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>Edit consultation note</h1>
      <div className="card">
        <NoteForm action={updateNoteAction.bind(null, id, noteId)} note={note} />
      </div>
    </div>
  );
}
