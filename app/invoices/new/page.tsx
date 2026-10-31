import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import { getClinicSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import InvoiceItemsEditor from "@/components/InvoiceItemsEditor";
import { createInvoiceAction } from "../actions";

function parsePrice(p: string | null): number { if (!p) return 0; const m = String(p).replace(/[^0-9.]/g, ""); return m ? Math.round(parseFloat(m) * 100) / 100 : 0; }

export default async function NewInvoicePage({ searchParams }: { searchParams: { patientId?: string } }) {
  await requireUser();
  const settings = await getClinicSettings();
  const patients = await listPatients();
  const presetId = searchParams.patientId ? Number(searchParams.patientId) : null;

  let appts: { id: number; label: string; price: number }[] = [];
  let plans: { id: number; label: string }[] = [];
  if (presetId) {
    const a = await query<{ id: number; starts_at: string; type_name: string | null; price: string | null }>(
      `SELECT ap.id, ap.starts_at, t.name AS type_name, t.price
         FROM appointments ap LEFT JOIN appointment_types t ON t.id = ap.appointment_type_id
        WHERE ap.patient_id = ? ORDER BY ap.starts_at DESC`,
      [presetId]
    );
    appts = a.map((x) => ({ id: x.id, label: `${x.type_name ?? "Appointment"} — ${new Date(x.starts_at).toLocaleDateString()}`, price: parsePrice(x.price) }));
    const pr = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'finalised' ORDER BY id DESC", [presetId]);
    plans = pr.map((p) => ({ id: p.id, label: `Supplement plan #${p.id}` }));
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <h1>New invoice</h1>
      <form action={createInvoiceAction} className="card stack" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 5 }}><span>Patient</span>
          <select name="patientId" defaultValue={presetId ?? ""} required>
            <option value="" disabled>Choose a patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <InvoiceItemsEditor appointments={appts} plans={plans} vatRate={settings.vat_rate} currency={settings.currency || "EUR"} />
        <label className="stack" style={{ gap: 5 }}><span>Due date <span className="muted-xs">(optional)</span></span><input name="dueDate" type="date" /></label>
        <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="notes" rows={2} /></label>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create draft</button>
      </form>
      <p className="muted-xs">Appointment &amp; plan prefills appear when you open this from a patient&apos;s page.</p>
    </div>
  );
}
