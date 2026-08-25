import { requireAdmin } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getClinicSettings();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
      <div>
        <h1>Clinic settings</h1>
        <p className="muted" style={{ marginTop: 2 }}>These appear on every exported plan PDF.</p>
      </div>
      <div className="card">
        <form action={saveSettingsAction} className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 5 }}><span>Clinic name</span><input name="clinic_name" defaultValue={s.clinic_name ?? ""} placeholder="Lorna's Nutrition Clinic" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address</span><input name="address" defaultValue={s.address ?? ""} placeholder="12 Harley Street, London" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Contact</span><input name="contact" defaultValue={s.contact ?? ""} placeholder="Phone · email" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Logo URL <span className="muted-xs">(optional)</span></span><input name="logo_url" defaultValue={s.logo_url ?? ""} placeholder="https://…" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Send-from email <span className="muted-xs">(optional)</span></span><input name="email_from" defaultValue={s.email_from ?? ""} placeholder="plans@clinic.co.uk" /></label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save settings</button>
        </form>
      </div>
    </div>
  );
}
