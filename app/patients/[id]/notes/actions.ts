"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createNote, updateNote, deleteNote } from "@/lib/consultation-notes";

function noteFromForm(formData: FormData) {
  return {
    noteDate: String(formData.get("noteDate") ?? "").trim(),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    subjective: String(formData.get("subjective") ?? ""),
    objective: String(formData.get("objective") ?? ""),
    assessment: String(formData.get("assessment") ?? ""),
    plan: String(formData.get("plan") ?? ""),
  };
}

export async function createNoteAction(patientId: number, formData: FormData) {
  const u = await requireUser();
  await createNote(patientId, { ...noteFromForm(formData), authorId: u.userId });
  redirect(`/patients/${patientId}`);
}

export async function updateNoteAction(patientId: number, noteId: number, formData: FormData) {
  const u = await requireUser();
  await updateNote(noteId, { ...noteFromForm(formData), authorId: u.userId });
  redirect(`/patients/${patientId}`);
}

export async function deleteNoteAction(patientId: number, noteId: number) {
  const u = await requireUser();
  await deleteNote(noteId, u.userId);
  revalidatePath(`/patients/${patientId}`);
}
