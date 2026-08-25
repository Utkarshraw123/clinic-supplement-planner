"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { saveClinicSettings } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveClinicSettings({
    clinic_name: String(formData.get("clinic_name") || "") || null,
    logo_url: String(formData.get("logo_url") || "") || null,
    address: String(formData.get("address") || "") || null,
    contact: String(formData.get("contact") || "") || null,
    email_from: String(formData.get("email_from") || "") || null,
  });
  revalidatePath("/admin/settings");
}
