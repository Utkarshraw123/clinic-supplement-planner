import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { getDashboardStats, recentPatients, recentlySent } from "@/lib/dashboard";
import { getPractitionerBreakdown } from "@/lib/analytics";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const u = await requireUser();
  const [stats, patients, sent, team] = await Promise.all([
    getDashboardStats(),
    recentPatients(),
    recentlySent(),
    u.role === "admin" ? getPractitionerBreakdown() : Promise.resolve([]),
  ]);

  const cards = [
    { label: "Patients", value: stats.patientCount, href: "/patients" },
    { label: "Draft plans", value: stats.draftPlans, href: "/plans/drafts" },
    { label: "Sent this week", value: stats.plansSentThisWeek },
    { label: "Sent all time", value: stats.plansSentAllTime },
  ] as { label: string; value: number; href?: string }[];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between">
        <div>
          <p className="eyebrow">Your practice</p>
          <h1>{greeting()}, {u.name.split(" ")[0]}</h1>
          <p className="muted" style={{ marginTop: 4 }}>Everything you need to build and send today&apos;s supplement plans.</p>
        </div>
        <Link href="/patients/new" className="btn btn--primary">New patient</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {cards.map((c) => {
          const inner = (
            <>
              <div className="stat-num">{c.value}</div>
              <div className="eyebrow" style={{ marginTop: 6 }}>{c.label}{c.href && <span aria-hidden="true" style={{ color: "var(--terracotta)", marginLeft: 6 }}>→</span>}</div>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="card stat-card--link" style={{ padding: "18px 20px", textDecoration: "none", color: "inherit", display: "block" }}>{inner}</Link>
          ) : (
            <div key={c.label} className="card" style={{ padding: "18px 20px" }}>{inner}</div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 18 }}>Recent patients</h2>
            <Link href="/patients" className="muted-xs">View all</Link>
          </div>
          {patients.length === 0 ? <p className="muted">No patients yet.</p> : patients.map((p) => (
            <div key={p.id} className="list-row">
              <Link href={`/plan/${p.id}`} style={{ fontWeight: 500, color: "var(--brand-ink)" }}>{p.name}</Link>
              <span className="muted-xs">DOB {p.dob}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recently sent</h2>
          {sent.length === 0 ? <p className="muted">No plans sent yet.</p> : sent.map((s) => (
            <div key={s.snapshotId} className="list-row">
              <span style={{ fontWeight: 500 }}>{s.patientName}</span>
              <span className="muted-xs">{(s.sentAt ?? "").slice(0, 10)}{s.email ? ` · ${s.email}` : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {u.role === "admin" && (
        <div className="card">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div>
              <p className="eyebrow">Practice oversight</p>
              <h2 style={{ fontSize: 18 }}>Your team</h2>
            </div>
            <Link href="/admin/analytics" className="muted-xs">Full analytics →</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Practitioner</th>
                  <th className="num">Patients</th>
                  <th className="num">Plans built</th>
                  <th className="num">Finalised</th>
                  <th className="num">Sent</th>
                </tr>
              </thead>
              <tbody>
                {team.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                      {r.role === "admin" && <span className="badge badge--ok" style={{ marginLeft: 8, fontSize: 11 }}>Owner</span>}
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
        </div>
      )}
    </div>
  );
}
