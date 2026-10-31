"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { createPortalLoginToken } from "@/lib/portal";
import { sendMagicLinkEmail } from "@/lib/email";

export async function requestMagicLinkAction(tenant: string, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    const client = await getTenantDb(tenant);
    await runWithDb(client, async () => {
      const issued = await createPortalLoginToken(email);
      if (issued) {
        const base = process.env.APP_BASE_URL || "http://localhost:3200";
        const link = `${base}/portal/${tenant}/verify?token=${issued.token}`;
        const settings = await getClinicSettings();
        await sendMagicLinkEmail({ to: email, clinicName: settings.clinic_name ?? "Your clinic", link });
      }
    });
  }
  // Always report "sent" (do not reveal whether the email exists).
  redirect(`/portal/${tenant}/login?sent=1`);
}
