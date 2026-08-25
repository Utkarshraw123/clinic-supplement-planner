import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";

export default async function PatientsPage() {
  await requireUser();
  const patients = await listPatients();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row-between">
        <div>
          <h1>Patients</h1>
          <p className="muted" style={{ marginTop: 2 }}>{patients.length} {patients.length === 1 ? "patient" : "patients"}</p>
        </div>
        <Link href="/patients/new"><button className="btn--sm btn--primary">Add patient</button></Link>
      </div>
      <div className="card">
        {patients.length === 0 && <p className="muted">No patients yet. Add your first to start a plan.</p>}
        {patients.map((p) => (
          <div key={p.id} className="list-row">
            <Link href={`/patients/${p.id}`} style={{ fontWeight: 500, color: "var(--ink)" }}>{p.name}</Link>
            <span className="muted-xs">DOB {p.dob}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
