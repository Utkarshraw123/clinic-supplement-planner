"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createDosingPreset, updateDosingPreset, archiveDosingPreset } from "@/lib/dosing";

export async function addDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await createDosingPreset(String(formData.get("label") || ""), String(formData.get("text") || ""));
  revalidatePath("/admin/dosing");
}

export async function updateDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await updateDosingPreset(Number(formData.get("id")), String(formData.get("label") || ""), String(formData.get("text") || ""));
  revalidatePath("/admin/dosing");
}

export async function deleteDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await archiveDosingPreset(Number(formData.get("id")));
  revalidatePath("/admin/dosing");
}
