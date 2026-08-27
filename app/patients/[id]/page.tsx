import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient, type AttrType } from "@/lib/patients";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { savePatientBasicsAction } from "@/app/patients/actions";
import ClinicalProfileForm, { type Section } from "@/components/ClinicalProfileForm";
import DeletePatientButton from "@/components/DeletePatientButton";
import Toaster from "@/components/Toaster";

const ATTR_MAP: { attr: AttrType; term: TermType; label: string; hint: string }[] = [
  { attr: "allergy", term: "allergen", label: "Allergies / intolerances", hint: "Hard-blocks matching products" },
  { attr: "goal", term: "concern", label: "Health goals", hint: "Drives suggestions" },
  { attr: "diet", term: "diet", label: "Dietary preferences", hint: "Filters unsuitable products" },
  { attr: "med_condition", term: "caution", label: "Medications / conditions", hint: "Raises warnings" },
];

export default async function PatientProfile({ params }: { params: { id: string } }) {
  const u = await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  const allTerms = await listTerms();

  const sections: Section[] = ATTR_MAP.map(({ attr, term, label, hint }) => ({
    attr, term, label, hint,
    options: allTerms.filter((t) => t.type === term).map((t) => ({ id: t.id, label: t.label })),
    selected: patient.attributes.filter((a) => a.attrType === attr).map((a) => a.termId),
  }));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Toaster />
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
        <p className="muted" style={{ marginBottom: 14 }}>Click to select any number in each section. Missing an option? Add it inline — it&apos;s saved to the taxonomy for next time.</p>
        <ClinicalProfileForm patientId={patient.id} sections={sections} />
      </div>

      {u.role === "admin" && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <h2 style={{ marginBottom: 2, color: "var(--danger)" }}>Danger zone</h2>
          <p className="muted-xs" style={{ marginBottom: 12 }}>
            Permanently erase {patient.name} and everything linked to them — clinical profile, all plans and guides, and any
            finalised or sent records (including the stored PDF and client email). Use this to fulfil a data-erasure request. This cannot be undone.
          </p>
          <DeletePatientButton patientId={patient.id} patientName={patient.name} />
        </div>
      )}
    </div>
  );
}
