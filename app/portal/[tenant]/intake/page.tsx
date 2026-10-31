import Link from "next/link";
import { getTenantDb, runWithDb } from "@/lib/db";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { getIntake, type IntakeRow } from "@/lib/intake";
import { savePortalIntakeAction } from "./actions";

const FIELDS: { name: string; label: string; key: keyof IntakeRow }[] = [
  { name: "chiefConcern", label: "What's your main concern?", key: "chief_concern" },
  { name: "healthHistory", label: "Relevant health history", key: "health_history" },
  { name: "currentMedications", label: "Current medications", key: "current_medications" },
  { name: "currentSupplements", label: "Current supplements", key: "current_supplements" },
  { name: "lifestyle", label: "Lifestyle (diet, sleep, activity)", key: "lifestyle" },
  { name: "goals", label: "Your goals", key: "goals" },
];

export default async function PortalIntakePage({ params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  const intake = await runWithDb(client, () => getIntake(patientId));
  const ta = { width: "100%", minHeight: 80, padding: 8 } as const;
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <Link href={`/portal/${tenant}`}>← Back</Link>
      <h1 style={{ fontSize: 22 }}>Your intake form</h1>
      <form action={savePortalIntakeAction.bind(null, tenant)} style={{ display: "grid", gap: 10 }}>
        {FIELDS.map((f) => (
          <label key={f.name} style={{ display: "grid", gap: 4 }}>
            <span>{f.label}</span>
            <textarea name={f.name} defaultValue={(intake?.[f.key] as string | null) ?? ""} style={ta} />
          </label>
        ))}
        <button type="submit" style={{ padding: 10, justifySelf: "start" }}>Save</button>
      </form>
    </main>
  );
}
