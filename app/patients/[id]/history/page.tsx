import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { listSnapshotsForPatient } from "@/lib/delivery";
import { sendSnapshotAction } from "@/app/plan/actions";

export default async function HistoryPage({ params }: { params: { id: string } }) {
  await requireUser();
  const patient = await getPatient(Number(params.id));
  if (!patient) notFound();
  const snaps = await listSnapshotsForPatient(patient.id);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div>
          <h1>{patient.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>Plan history</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/plan/${patient.id}`} className="btn btn--sm">New plan</Link>
          <Link href={`/patients/${patient.id}`} className="btn btn--sm">Profile</Link>
        </div>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        {snaps.length === 0 ? <p className="muted">No finalised plans yet.</p> : snaps.map((s) => {
          const when = (s.sent_at ?? s.created_at)?.slice(0, 16).replace("T", " ");
          const sent = !!s.sent_at;
          return (
            <div key={s.id} style={{ borderBottom: "1px solid var(--sand-border)", paddingBottom: 12 }}>
              <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className={`badge ${sent ? "badge--ok" : "badge--neutral"}`}>{sent ? "Sent" : "Finalised"}</span>
                  <span style={{ fontSize: 14 }}>
                    {sent ? `Emailed ${when}` : `Finalised ${when}`}
                    {s.sent_to_email ? ` · ${s.sent_to_email}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={`/api/snapshots/${s.id}/pdf`} target="_blank" className="btn btn--sm">View</a>
                  <a href={`/api/snapshots/${s.id}/pdf?download=1`} className="btn btn--sm btn--primary">Download PDF</a>
                </div>
              </div>
              {!sent && (
                <form action={sendSnapshotAction} style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="snapshotId" value={s.id} />
                  <input type="hidden" name="patientId" value={patient.id} />
                  <span className="muted-xs">Not emailed.</span>
                  <input name="email" type="email" placeholder="client@email.com" required style={{ flex: 1, minWidth: 180, height: 34 }} />
                  <button type="submit" className="btn--sm">Email this plan</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
