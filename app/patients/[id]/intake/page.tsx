import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getIntake, type IntakeRow } from "@/lib/intake";
import { saveIntakeAction } from "./actions";

const FIELDS: { name: string; label: string; key: keyof IntakeRow }[] = [
  { name: "chiefConcern", label: "Chief concern", key: "chief_concern" },
  { name: "healthHistory", label: "Health history", key: "health_history" },
  { name: "currentMedications", label: "Current medications", key: "current_medications" },
  { name: "currentSupplements", label: "Current supplements", key: "current_supplements" },
  { name: "lifestyle", label: "Lifestyle", key: "lifestyle" },
  { name: "goals", label: "Goals", key: "goals" },
];

export default async function IntakePage({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const [patient, intake] = await Promise.all([getPatient(id), getIntake(id)]);
  if (!patient) notFound();
  const ta = { width: "100%", minHeight: 80, padding: 8 } as const;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>Intake — {patient.name}</h1>
      <div className="card">
        <form action={saveIntakeAction.bind(null, id)} className="stack" style={{ gap: 10, maxWidth: 680 }}>
          {FIELDS.map((f) => (
            <label key={f.name} className="stack" style={{ gap: 5 }}>
              <span>{f.label}</span>
              <textarea name={f.name} defaultValue={(intake?.[f.key] as string | null) ?? ""} style={ta} />
            </label>
          ))}
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save intake</button>
        </form>
      </div>
    </div>
  );
}
