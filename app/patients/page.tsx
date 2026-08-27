import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import PageHeader from "@/components/PageHeader";
import PatientSearch from "@/components/PatientSearch";

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
      <PatientSearch patients={patients.map((p) => ({ id: p.id, name: p.name, dob: p.dob }))} />
    </div>
  );
}
