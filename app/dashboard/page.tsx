import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { getDashboardStats, recentPatients, recentlySent } from "@/lib/dashboard";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const u = await requireUser();
  const stats = await getDashboardStats();
  const patients = await recentPatients();
  const sent = await recentlySent();

  const cards = [
    { label: "Patients", value: stats.patientCount },
    { label: "Draft plans", value: stats.draftPlans },
    { label: "Sent this week", value: stats.plansSentThisWeek },
    { label: "Sent all time", value: stats.plansSentAllTime },
  ];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="row-between">
        <div>
          <p className="eyebrow">Your practice</p>
          <h1>{greeting()}, {u.name.split(" ")[0]}</h1>
          <p className="muted" style={{ marginTop: 4 }}>Everything you need to build and send today&apos;s supplement plans.</p>
        </div>
        <Link href="/patients/new"><button className="btn--primary">New patient</button></Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
            <div className="stat-num">{c.value}</div>
            <div className="eyebrow" style={{ marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: 18 }}>Recent patients</h2>
            <Link href="/patients" className="muted-xs">View all</Link>
          </div>
          {patients.length === 0 ? <p className="muted">No patients yet.</p> : patients.map((p) => (
            <div key={p.id} className="list-row">
              <Link href={`/plan/${p.id}`} style={{ fontWeight: 500, color: "var(--navy-ink)" }}>{p.name}</Link>
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
    </div>
  );
}
