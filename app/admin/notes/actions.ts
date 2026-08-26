"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createSnippet, deleteSnippet } from "@/lib/notes";

export async function addSnippetAction(formData: FormData) {
  const u = await requireAdmin();
  const text = String(formData.get("text") || "").trim();
  if (text) await createSnippet(text, u.userId);
  revalidatePath("/admin/notes");
}

export async function deleteSnippetAction(formData: FormData) {
  await requireAdmin();
  await deleteSnippet(Number(formData.get("id")));
  revalidatePath("/admin/notes");
}
