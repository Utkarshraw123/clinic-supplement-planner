import { requireAdmin } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import { LETTERHEAD_THEMES, DEFAULT_LETTERHEAD } from "@/lib/pdf-themes";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getClinicSettings();
  const selectedTemplate = s.letterhead_template ?? DEFAULT_LETTERHEAD;
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

          <div className="stack" style={{ gap: 5, marginTop: 4 }}>
            <span>Prescription letterhead</span>
            <p className="muted-xs" style={{ margin: 0 }}>The colour scheme of the exported plan PDF. Your logo, letterhead banner and typeface stay exactly the same — only the accent colour of the headings, table and links changes. Applies to plans finalised from here on.</p>
            <style>{`
              .lh-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
              .lh-option{cursor:pointer}
              .lh-option input{position:absolute;opacity:0;pointer-events:none}
              .lh-card{display:block;border:1.5px solid var(--border,#E3D9C6);border-radius:10px;padding:10px 12px;transition:border-color .12s,box-shadow .12s}
              .lh-option input:checked + .lh-card{border-color:var(--accent,#A17C3A);box-shadow:0 0 0 2px rgba(161,124,58,.18)}
              .lh-swatches{display:flex;gap:5px;margin-bottom:7px}
              .lh-dot{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.08)}
              .lh-name{font-size:13px;font-weight:600}
              .lh-desc{font-size:11px;color:var(--ink-muted,#6B6B63);margin-top:1px}
            `}</style>
            <div className="lh-grid">
              {LETTERHEAD_THEMES.map((t) => (
                <label key={t.id} className="lh-option">
                  <input type="radio" name="letterhead_template" value={t.id} defaultChecked={selectedTemplate === t.id} />
                  <span className="lh-card">
                    <span className="lh-swatches">
                      <span className="lh-dot" style={{ background: t.accent }} />
                      <span className="lh-dot" style={{ background: t.rule }} />
                      <span className="lh-dot" style={{ background: t.ink }} />
                    </span>
                    <span className="lh-name">{t.name}</span>
                    <span className="lh-desc">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save settings</button>
        </form>
      </div>
    </div>
  );
}
