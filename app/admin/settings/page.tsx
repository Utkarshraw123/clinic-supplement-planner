import { requireAdmin } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getClinicSettings();
  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Clinic settings</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>These appear on every exported plan PDF.</p>
      <form action={saveSettingsAction} style={{ display: "grid", gap: 8 }}>
        <input name="clinic_name" defaultValue={s.clinic_name ?? ""} placeholder="Clinic name" />
        <input name="address" defaultValue={s.address ?? ""} placeholder="Address" />
        <input name="contact" defaultValue={s.contact ?? ""} placeholder="Phone / email" />
        <input name="logo_url" defaultValue={s.logo_url ?? ""} placeholder="Logo URL (optional)" />
        <input name="email_from" defaultValue={s.email_from ?? ""} placeholder="Send-from email (optional)" />
        <button type="submit">Save settings</button>
      </form>
    </main>
  );
}
