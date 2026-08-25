import { requireAdmin } from "@/lib/auth/current-user";
import { getPractitionerBreakdown, getPracticeTotals } from "@/lib/analytics";
import PageHeader from "@/components/PageHeader";

export default async function AnalyticsPage() {
  await requireAdmin();
  const totals = await getPracticeTotals();
  const rows = await getPractitionerBreakdown();

  const cards = [
    { label: "Patients", value: totals.patients },
    { label: "Plans built", value: totals.plansBuilt },
    { label: "Plans finalised", value: totals.plansFinalised },
    { label: "Sent (30 days)", value: totals.sentLast30Days },
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader
        eyebrow="Practice oversight"
        title="Team analytics"
        subtitle="What each practitioner is doing across the practice"
        actions={<a href="/api/export/analytics" className="btn btn--on-dark">Export CSV</a>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div className="stat-num">{c.value}</div>
            <div className="eyebrow" style={{ marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>By practitioner</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Practitioner</th>
                <th>Role</th>
                <th className="num">Patients</th>
                <th className="num">Plans built</th>
                <th className="num">Finalised</th>
                <th className="num">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="muted">No practitioners yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="muted-xs">{r.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${r.role === "admin" ? "badge--ok" : "badge--neutral"}`}>
                      {r.role === "admin" ? "Owner" : "Nutritionist"}
                    </span>
                  </td>
                  <td className="num">{r.patients}</td>
                  <td className="num">{r.plansBuilt}</td>
                  <td className="num">{r.plansFinalised}</td>
                  <td className="num">{r.plansSent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted-xs" style={{ marginTop: 10 }}>
          &ldquo;Finalised&rdquo; counts every plan turned into a PDF (downloaded or sent). &ldquo;Sent&rdquo; counts those emailed to a client.
        </p>
      </div>
    </div>
  );
}
