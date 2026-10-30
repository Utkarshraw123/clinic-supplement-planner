import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import NoteForm from "../NoteForm";
import { createNoteAction } from "../actions";

export default async function NewNotePage({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>New consultation note</h1>
      <div className="card">
        <NoteForm action={createNoteAction.bind(null, id)} />
      </div>
    </div>
  );
}
