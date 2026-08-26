"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createSnippet, deleteSnippet, type SnippetCategory } from "@/lib/notes";

const CATEGORIES: SnippetCategory[] = ["supplement", "lifestyle", "dietary", "intro", "next", "general"];

export async function addSnippetAction(formData: FormData) {
  const u = await requireAdmin();
  const text = String(formData.get("text") || "").trim();
  const raw = String(formData.get("category") || "supplement") as SnippetCategory;
  const category = CATEGORIES.includes(raw) ? raw : "supplement";
  if (text) await createSnippet(text, category, u.userId);
  revalidatePath("/admin/notes");
}

export async function deleteSnippetAction(formData: FormData) {
  await requireAdmin();
  await deleteSnippet(Number(formData.get("id")));
  revalidatePath("/admin/notes");
}
