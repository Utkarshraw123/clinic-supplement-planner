"use client";
import { useMemo, useState } from "react";

type Row = { description: string; quantity: number; unitPrice: number; source: string; appointmentId?: number; planId?: number };
type ApptOpt = { id: number; label: string; price: number };
type PlanOpt = { id: number; label: string };

export default function InvoiceItemsEditor({
  initialItems = [], appointments = [], plans = [], vatRate = null, currency = "EUR",
}: { initialItems?: Row[]; appointments?: ApptOpt[]; plans?: PlanOpt[]; vatRate?: number | null; currency?: string }) {
  const [rows, setRows] = useState<Row[]>(
    initialItems.length ? initialItems : [{ description: "", quantity: 1, unitPrice: 0, source: "free" }]
  );

  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€";
  const lineCents = (r: Row) => Math.round((r.quantity || 0) * Math.round((r.unitPrice || 0) * 100));
  const subtotal = rows.reduce((s, r) => s + lineCents(r), 0);
  const rate = vatRate && vatRate > 0 ? vatRate : 0;
  const tax = Math.round((subtotal * rate) / 100);
  const total = subtotal + tax;
  const money = (c: number) => `${sym}${(c / 100).toFixed(2)}`;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = (row: Row) => setRows((rs) => [...rs, row]);

  const itemsJson = useMemo(() => JSON.stringify(rows.filter((r) => r.description.trim() !== "")), [rows]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="items" value={itemsJson} />
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: "center" }}>
          <input style={{ flex: 1 }} placeholder="Description" value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
          <input style={{ width: 64 }} type="number" step="0.5" min="0" value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <input style={{ width: 96 }} type="number" step="0.01" min="0" value={r.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} />
          <span className="muted-xs" style={{ width: 84, textAlign: "right" }}>{money(lineCents(r))}</span>
          <button type="button" className="btn" onClick={() => remove(i)}>×</button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => add({ description: "", quantity: 1, unitPrice: 0, source: "free" })}>+ Add line</button>
        <button type="button" className="btn" onClick={() => add({ description: "Package", quantity: 1, unitPrice: 0, source: "package" })}>+ Add package</button>
        {appointments.length ? (
          <select defaultValue="" onChange={(e) => { const a = appointments.find((x) => String(x.id) === e.target.value); if (a) add({ description: a.label, quantity: 1, unitPrice: a.price, source: "appointment", appointmentId: a.id }); e.currentTarget.value = ""; }}>
            <option value="">+ From appointment…</option>
            {appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        ) : null}
        {plans.length ? (
          <select defaultValue="" onChange={(e) => { const p = plans.find((x) => String(x.id) === e.target.value); if (p) add({ description: p.label, quantity: 1, unitPrice: 0, source: "plan", planId: p.id }); e.currentTarget.value = ""; }}>
            <option value="">+ From plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        ) : null}
      </div>

      <div className="stack" style={{ gap: 2, marginLeft: "auto", width: 220 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">Subtotal</span><span>{money(subtotal)}</span></div>
        {tax > 0 ? <div className="row" style={{ justifyContent: "space-between" }}><span className="muted">VAT {rate}%</span><span>{money(tax)}</span></div> : null}
        <div className="row" style={{ justifyContent: "space-between", fontWeight: 700 }}><span>Total</span><span>{money(total)}</span></div>
      </div>
    </div>
  );
}
