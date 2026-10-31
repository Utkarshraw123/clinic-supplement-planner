"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { saveClinicSettings, saveInvoiceSettings, setStripeSecretKey } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveClinicSettings({
    clinic_name: String(formData.get("clinic_name") || "") || null,
    logo_url: String(formData.get("logo_url") || "") || null,
    address: String(formData.get("address") || "") || null,
    contact: String(formData.get("contact") || "") || null,
    email_from: String(formData.get("email_from") || "") || null,
    letterhead_template: String(formData.get("letterhead_template") || "") || null,
  });
  const vatRaw = String(formData.get("vat_rate") || "").trim();
  await saveInvoiceSettings({
    currency: String(formData.get("currency") || "") || "EUR",
    vat_rate: vatRaw === "" ? null : Number(vatRaw),
    vat_number: String(formData.get("vat_number") || "") || null,
    invoice_prefix: String(formData.get("invoice_prefix") || "") || "INV-",
  });
  const key = String(formData.get("stripe_secret_key") || "").trim();
  if (key) await setStripeSecretKey(key);
  revalidatePath("/admin/settings");
}
