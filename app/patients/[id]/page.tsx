import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient, type AttrType } from "@/lib/patients";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { savePatientBasicsAction, savePatientAttributesAction } from "@/app/patients/actions";

const ATTR_MAP: { attr: AttrType; term: TermType; label: string; hint: string }[] = [
  { attr: "allergy", term: "allergen", label: "Allergies / intolerances", hint: "Hard-blocks matching products" },
  { attr: "goal", term: "concern", label: "Health goals", hint: "Drives suggestions" },
  { attr: "diet", term: "diet", label: "Dietary preferences", hint: "Filters unsuitable products" },
  { attr: "med_condition", term: "caution", label: "Medications / conditions", hint: "Raises warnings" },
];

export default async function PatientProfile({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  const allTerms = await listTerms();

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <div>
          <h1>{patient.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>DOB {patient.dob}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/patients/${patient.id}/history`}><button className="btn--sm">History</button></Link>
          <Link href={`/plan/${patient.id}`}><button className="btn--sm btn--primary">Open plan</button></Link>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Details</h2>
        <form action={savePatientBasicsAction} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <input type="hidden" name="id" value={patient.id} />
          <label className="stack" style={{ gap: 5 }}><span>Full name</span><input name="name" defaultValue={patient.name} /></label>
          <label className="stack" style={{ gap: 5 }}><span>Date of birth</span><input name="dob" type="date" defaultValue={patient.dob} /></label>
          <button type="submit">Save</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 2 }}>Clinical profile</h2>
        <p className="muted" style={{ marginBottom: 14 }}>Terms come from admin → taxonomies. These drive flagging and suggestions.</p>
        <form action={savePatientAttributesAction} className="stack" style={{ gap: 16 }}>
          <input type="hidden" name="patientId" value={patient.id} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {ATTR_MAP.map(({ attr, term, label, hint }) => {
              const selected = patient.attributes.filter((a) => a.attrType === attr).map((a) => String(a.termId));
              return (
                <label key={attr} className="stack" style={{ gap: 5 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span>{label}</span>
                    <span className="muted-xs">{hint}</span>
                  </span>
                  <select name={`attr:${attr}`} multiple defaultValue={selected}>
                    {allTerms.filter((t) => t.type === term).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save profile</button>
        </form>
      </div>
    </div>
  );
}
