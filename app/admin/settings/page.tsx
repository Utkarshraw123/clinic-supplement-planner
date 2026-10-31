import { requireAdmin } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import { LETTERHEAD_THEMES, DEFAULT_LETTERHEAD } from "@/lib/pdf-themes";
import LetterheadPreviewButton from "@/components/LetterheadPreviewButton";
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
            <p className="muted-xs" style={{ margin: 0 }}>The background colour behind the header &amp; footer of the exported plan PDF. Your logo, all text and the body stay exactly the same — only the header/footer background changes. Applies to plans finalised from here on.</p>
            <style>{`
              .lh-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
              .lh-option{cursor:pointer}
              .lh-option input{position:absolute;opacity:0;pointer-events:none}
              .lh-card{display:block;border:1.5px solid var(--border,#E3D9C6);border-radius:10px;padding:10px 12px;transition:border-color .12s,box-shadow .12s}
              .lh-option input:checked + .lh-card{border-color:var(--accent,#A17C3A);box-shadow:0 0 0 2px rgba(161,124,58,.18)}
              .lh-swatch{display:block;height:34px;border-radius:6px;border:1px solid rgba(0,0,0,.08);margin-bottom:7px;position:relative}
              .lh-logo{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-style:italic;font-size:15px;color:#A17C3A}
              .lh-name{font-size:13px;font-weight:600}
              .lh-desc{font-size:11px;color:var(--ink-muted,#6B6B63);margin-top:1px}
            `}</style>
            <div className="lh-grid">
              {LETTERHEAD_THEMES.map((t) => (
                <label key={t.id} className="lh-option">
                  <input type="radio" name="letterhead_template" value={t.id} defaultChecked={selectedTemplate === t.id} />
                  <span className="lh-card">
                    <span className="lh-swatch" style={{ background: t.bg ?? "#FFFFFF" }}>
                      <span className="lh-logo">Lorna</span>
                    </span>
                    <span className="lh-name">{t.name}</span>
                    <span className="lh-desc">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <LetterheadPreviewButton />
            <p className="muted-xs" style={{ margin: 0 }}>Preview opens a sample plan in the selected colour. The colour applies to plans finalised after you Save — plans already finalised keep the colour they were made with.</p>
          </div>

          <div className="stack" style={{ gap: 10, marginTop: 8, borderTop: "1px solid var(--border,#eee)", paddingTop: 12 }}>
            <span style={{ fontWeight: 600 }}>Invoicing</span>
            <div className="row" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>Currency</span>
                <select name="currency" defaultValue={s.currency ?? "EUR"}>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </label>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>Invoice prefix</span><input name="invoice_prefix" defaultValue={s.invoice_prefix ?? "INV-"} /></label>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>VAT rate % <span className="muted-xs">(blank = not registered)</span></span><input name="vat_rate" type="number" step="0.1" min="0" defaultValue={s.vat_rate ?? ""} /></label>
              <label className="stack" style={{ gap: 5, flex: 1 }}><span>VAT number</span><input name="vat_number" defaultValue={s.vat_number ?? ""} /></label>
            </div>
            <label className="stack" style={{ gap: 5 }}><span>Stripe secret key <span className="muted-xs">{s.stripe_secret_key ? "(set — leave blank to keep)" : "(optional, test key)"}</span></span><input name="stripe_secret_key" type="password" placeholder={s.stripe_secret_key ? "••••••••" : "sk_test_…"} /></label>
          </div>

          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save settings</button>
        </form>
      </div>
    </div>
  );
}
