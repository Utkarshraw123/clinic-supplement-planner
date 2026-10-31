import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getInvoice } from "@/lib/invoices";
import { getPatient } from "@/lib/patients";
import { getClinicSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import InvoiceItemsEditor from "@/components/InvoiceItemsEditor";
import { saveDraftAction, finaliseAction, markPaidAction, voidAction, createPayLinkAction, emailInvoiceAction } from "../actions";

function money(cents: number, currency: string) { const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€"; return `${sym}${(cents / 100).toFixed(2)}`; }
function parsePrice(p: string | null): number { if (!p) return 0; const m = String(p).replace(/[^0-9.]/g, ""); return m ? Math.round(parseFloat(m) * 100) / 100 : 0; }

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const got = await getInvoice(id);
  if (!got) notFound();
  const { invoice, items } = got;
  const settings = await getClinicSettings();
  const patient = await getPatient(invoice.patient_id);
  const cur = invoice.currency || "EUR";

  if (invoice.status === "draft") {
    const a = await query<{ id: number; starts_at: string; type_name: string | null; price: string | null }>(
      `SELECT ap.id, ap.starts_at, t.name AS type_name, t.price
         FROM appointments ap LEFT JOIN appointment_types t ON t.id = ap.appointment_type_id
        WHERE ap.patient_id = ? ORDER BY ap.starts_at DESC`,
      [invoice.patient_id]
    );
    const appts = a.map((x) => ({ id: x.id, label: `${x.type_name ?? "Appointment"} — ${new Date(x.starts_at).toLocaleDateString()}`, price: parsePrice(x.price) }));
    const pr = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'finalised' ORDER BY id DESC", [invoice.patient_id]);
    const plans = pr.map((p) => ({ id: p.id, label: `Supplement plan #${p.id}` }));
    const initial = items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unit_price_cents / 100, source: it.source ?? "free", appointmentId: it.appointment_id ?? undefined, planId: it.plan_id ?? undefined }));

    return (
      <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
        <div className="row-between"><h1>Draft invoice</h1><Link href={`/patients/${invoice.patient_id}`} className="btn--sm">{patient?.name}</Link></div>
        <form action={saveDraftAction.bind(null, id)} className="card stack" style={{ gap: 12 }}>
          <InvoiceItemsEditor initialItems={initial} appointments={appts} plans={plans} vatRate={settings.vat_rate} currency={cur} />
          <label className="stack" style={{ gap: 5 }}><span>Due date</span><input name="dueDate" type="date" defaultValue={invoice.due_date ?? ""} /></label>
          <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="notes" rows={2} defaultValue={invoice.notes ?? ""} /></label>
          <button type="submit" className="btn">Save draft</button>
        </form>
        <form action={finaliseAction.bind(null, id)}><button type="submit" className="btn--primary">Finalise invoice</button></form>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <div className="row-between">
        <div><h1>{invoice.number}</h1><p className="muted">{patient?.name} · <strong>{invoice.status}</strong></p></div>
        <Link href={`/api/invoices/${id}/pdf`} target="_blank" className="btn--sm">Download PDF</Link>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {items.map((it) => (
          <div key={it.id} className="row" style={{ justifyContent: "space-between" }}><span>{it.description} × {it.quantity}</span><span>{money(it.amount_cents, cur)}</span></div>
        ))}
        <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}><span className="muted">Subtotal</span><span>{money(invoice.subtotal_cents, cur)}</span></div>
        {invoice.tax_cents > 0 ? <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">VAT {invoice.tax_rate}%</span><span>{money(invoice.tax_cents, cur)}</span></div> : null}
        <div className="row" style={{ justifyContent: "space-between", fontWeight: 700 }}><span>Total</span><span>{money(invoice.total_cents, cur)}</span></div>
        {invoice.payment_link_url ? <p className="muted-xs">Pay link: {invoice.payment_link_url}</p> : null}
      </div>
      {invoice.status !== "void" ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {!invoice.payment_link_url ? <form action={createPayLinkAction.bind(null, id)}><button type="submit" className="btn">Create pay link</button></form> : null}
          {patient?.email ? <form action={emailInvoiceAction.bind(null, id)}><button type="submit" className="btn">Email to patient</button></form> : null}
          {invoice.status !== "paid" ? <form action={markPaidAction.bind(null, id)}><button type="submit" className="btn--primary">Mark paid</button></form> : null}
          {invoice.status !== "paid" ? <form action={voidAction.bind(null, id)}><button type="submit" className="btn">Void</button></form> : null}
        </div>
      ) : null}
    </div>
  );
}
