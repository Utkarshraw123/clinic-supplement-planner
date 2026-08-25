"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { addTerm, deleteTerm, type TermType } from "@/lib/taxonomies";

export async function addTermAction(formData: FormData) {
  const u = await requireAdmin();
  await addTerm(String(formData.get("type")) as TermType, String(formData.get("label")), u.userId);
  revalidatePath("/admin/taxonomies");
}

export async function deleteTermAction(formData: FormData) {
  await requireAdmin();
  await deleteTerm(Number(formData.get("id")));
  revalidatePath("/admin/taxonomies");
}
