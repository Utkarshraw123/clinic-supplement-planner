import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient, type AttrType } from "@/lib/patients";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { savePatientBasicsAction, savePatientAttributesAction } from "@/app/patients/actions";

const ATTR_MAP: { attr: AttrType; term: TermType; label: string }[] = [
  { attr: "allergy", term: "allergen", label: "Allergies / intolerances" },
  { attr: "goal", term: "concern", label: "Health goals" },
  { attr: "diet", term: "diet", label: "Dietary preferences" },
  { attr: "med_condition", term: "caution", label: "Medications / conditions" },
];

export default async function PatientProfile({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  const allTerms = await listTerms();

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", display: "grid", gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontWeight: 500 }}>{patient.name}</h1>
          <span style={{ display: "flex", gap: 12 }}>
            <Link href={`/patients/${patient.id}/history`}>History</Link>
            <Link href={`/plan/${patient.id}`}>Open plan</Link>
          </span>
        </div>
        <form action={savePatientBasicsAction} style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input type="hidden" name="id" value={patient.id} />
          <input name="name" defaultValue={patient.name} />
          <input name="dob" type="date" defaultValue={patient.dob} />
          <button type="submit">Save details</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Clinical profile</h2>
        <form action={savePatientAttributesAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="patientId" value={patient.id} />
          {ATTR_MAP.map(({ attr, term, label }) => {
            const selected = patient.attributes.filter((a) => a.attrType === attr).map((a) => String(a.termId));
            return (
              <label key={attr} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <select name={`attr:${attr}`} multiple defaultValue={selected}>
                  {allTerms.filter((t) => t.type === term).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            );
          })}
          <button type="submit">Save profile</button>
        </form>
        <p style={{ fontSize: 12, color: "#5F5E5A" }}>Terms come from admin → taxonomies. Allergies drive hard blocks; conditions and diet drive warnings.</p>
      </section>
    </main>
  );
}
