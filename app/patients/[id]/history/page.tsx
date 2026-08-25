import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { listSnapshotsForPatient } from "@/lib/delivery";

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
        <Link href={`/patients/${patient.id}`} className="muted">← Back to profile</Link>
      </div>
      <div className="card">
        {snaps.length === 0 ? <p className="muted">No finalised plans yet.</p> : snaps.map((s) => (
          <div key={s.id} className="list-row">
            <span>Sent {(s.sent_at ?? s.created_at)?.slice(0, 16).replace("T", " ")}{s.sent_to_email ? ` · ${s.sent_to_email}` : ""}</span>
            <Link href={`/api/snapshots/${s.id}/pdf`} target="_blank"><button className="btn--sm">Download PDF</button></Link>
          </div>
        ))}
      </div>
    </div>
  );
}
