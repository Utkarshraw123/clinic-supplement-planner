import Link from "next/link";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { getPatient } from "@/lib/patients";
import { listSnapshotsForPatient } from "@/lib/delivery";

export default async function PortalHome({ params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  const data = await runWithDb(client, async () => {
    const settings = await getClinicSettings();
    const patient = await getPatient(patientId);
    const snaps = await listSnapshotsForPatient(patientId);
    return { clinicName: settings.clinic_name || "Our clinic", name: patient?.name ?? "", snaps };
  });
  const fmt = (iso: string) => new Date(iso).toLocaleDateString();
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Welcome{data.name ? `, ${data.name.split(" ")[0]}` : ""}</h1>
      <p style={{ color: "#555" }}>Your {data.clinicName} portal.</p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Your plans</h2>
        {data.snaps.length === 0 ? <p style={{ color: "#666" }}>No plans have been shared with you yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {data.snaps.map((s) => (
              <li key={s.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between" }}>
                <span>Plan from {fmt(s.created_at)}</span>
                <a href={`/portal/${tenant}/plan/${s.id}/pdf`}>Download PDF</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Your intake</h2>
        <p><Link href={`/portal/${tenant}/intake`}>View / update your intake form →</Link></p>
      </section>
    </main>
  );
}
