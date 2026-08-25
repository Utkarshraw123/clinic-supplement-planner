import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";

export default async function PatientsPage() {
  await requireUser();
  const patients = await listPatients();
  return (
    <main style={{ maxWidth: 680, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontWeight: 500 }}>Patients</h1>
        <Link href="/patients/new">Add patient</Link>
      </div>
      <ul style={{ marginTop: 16 }}>
        {patients.map((p) => (
          <li key={p.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd" }}>
            <Link href={`/patients/${p.id}`}>{p.name}</Link>
            <span style={{ color: "#5F5E5A", fontSize: 13 }}> · DOB {p.dob}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
