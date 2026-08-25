import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import PageHeader from "@/components/PageHeader";

export default async function PatientsPage() {
  await requireUser();
  const patients = await listPatients();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Your practice"
        title="Patients"
        subtitle={`${patients.length} ${patients.length === 1 ? "patient" : "patients"} on file`}
        actions={
          <>
            <a href="/api/export/patients" className="btn btn--on-dark">Export CSV</a>
            <Link href="/patients/new" className="btn btn--accent">+ Add patient</Link>
          </>
        }
      />
      <div className="card">
        {patients.length === 0 && <p className="muted">No patients yet. Add your first to start a plan.</p>}
        {patients.map((p) => (
          <div key={p.id} className="list-row">
            <Link href={`/patients/${p.id}`} style={{ fontWeight: 500, color: "var(--navy-ink)" }}>{p.name}</Link>
            <span className="muted-xs">DOB {p.dob}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
