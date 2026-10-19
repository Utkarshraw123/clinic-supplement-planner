"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createDietaryProtocol, updateDietaryProtocol, deleteDietaryProtocol } from "@/lib/dietary-protocols";

export async function addDietaryProtocolAction(formData: FormData) {
  const u = await requireAdmin();
  await createDietaryProtocol(String(formData.get("name") || ""), String(formData.get("body") || ""), u.userId);
  revalidatePath("/admin/dietary-protocols");
}

export async function updateDietaryProtocolAction(formData: FormData) {
  await requireAdmin();
  await updateDietaryProtocol(Number(formData.get("id")), String(formData.get("name") || ""), String(formData.get("body") || ""));
  revalidatePath("/admin/dietary-protocols");
}

export async function deleteDietaryProtocolAction(formData: FormData) {
  await requireAdmin();
  await deleteDietaryProtocol(Number(formData.get("id")));
  revalidatePath("/admin/dietary-protocols");
}
