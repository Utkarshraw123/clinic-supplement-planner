import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan } from "@/lib/plans";
import { listSnapshots } from "@/lib/delivery";

export default async function HistoryPage({ params }: { params: { id: string } }) {
  await requireUser();
  const patient = await getPatient(Number(params.id));
  if (!patient) notFound();
  const planId = await getOrCreateDraftPlan(patient.id);
  const snaps = await listSnapshots(planId);
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>{patient.name} — plan history</h1>
      {snaps.length === 0 ? <p style={{ color: "#5F5E5A" }}>No finalised plans yet.</p> : (
        <ul>
          {snaps.map((s) => (
            <li key={s.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd", display: "flex", justifyContent: "space-between" }}>
              <span>Sent {s.sent_at ?? s.created_at}{s.sent_to_email ? ` to ${s.sent_to_email}` : ""}</span>
              <Link href={`/api/snapshots/${s.id}/pdf`}>Download PDF</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
