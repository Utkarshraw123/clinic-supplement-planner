import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listInvoices, type InvoiceStatus } from "@/lib/invoices";

function money(cents: number, currency: string) { const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€"; return `${sym}${(cents / 100).toFixed(2)}`; }

export default async function InvoicesPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireUser();
  const status = (searchParams.status as InvoiceStatus | undefined);
  const invoices = await listInvoices(status ? { status } : undefined);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <h1>Invoices</h1>
        <Link href="/invoices/new" className="btn--primary">+ New invoice</Link>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {["all", "draft", "sent", "paid", "void"].map((s) => (
          <Link key={s} href={s === "all" ? "/invoices" : `/invoices?status=${s}`} className="btn--sm">{s}</Link>
        ))}
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {invoices.length === 0 ? <p className="muted">No invoices.</p> : invoices.map((i) => (
          <Link key={i.id} href={`/invoices/${i.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{i.number ?? "(draft)"} · {i.patient_name ?? "—"}</span>
            <span>{money(i.total_cents, i.currency)} · <strong>{i.status}</strong></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
