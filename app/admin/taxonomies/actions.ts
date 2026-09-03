"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-user";
import { addTerm, deleteTerm, type TermType } from "@/lib/taxonomies";

export async function addTermAction(formData: FormData) {
  const u = await requireAdmin();
  await addTerm(String(formData.get("type")) as TermType, String(formData.get("label")), u.userId);
  revalidatePath("/admin/taxonomies");
}

export async function deleteTermAction(formData: FormData) {
  await requireAdmin();
  try {
    await deleteTerm(Number(formData.get("id")));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not retire this term.";
    redirect(`/admin/taxonomies?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/admin/taxonomies");
}
