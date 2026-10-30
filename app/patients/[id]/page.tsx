import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient, type AttrType } from "@/lib/patients";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { latestConsentByPurpose } from "@/lib/consent";
import { listNotesForPatient } from "@/lib/consultation-notes";
import { getIntake } from "@/lib/intake";
import { deleteNoteAction } from "./notes/actions";
import { savePatientBasicsAction } from "@/app/patients/actions";
import { CONSENT_PURPOSES } from "./consent-config";
import { grantConsentAction, withdrawConsentAction } from "./consent-actions";
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
  const consent = await latestConsentByPurpose(id);
  const notes = await listNotesForPatient(id);
  const intake = await getIntake(id);

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
        <form action={savePatientBasicsAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={patient.id} />
          <div className="row" style={{ gap: 10 }}>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Full name</span><input name="name" defaultValue={patient.name} /></label>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Date of birth</span><input name="dob" type="date" defaultValue={patient.dob} /></label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Email <span className="muted-xs">(used to send plans)</span></span><input name="email" type="email" defaultValue={patient.email ?? ""} placeholder="client@email.com" /></label>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Phone</span><input name="phone" defaultValue={patient.phone ?? ""} /></label>
          </div>
          <label className="stack" style={{ gap: 5 }}><span>Address line 1</span><input name="address1" defaultValue={patient.address1 ?? ""} /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address line 2</span><input name="address2" defaultValue={patient.address2 ?? ""} /></label>
          <div className="row" style={{ gap: 10 }}>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>City</span><input name="city" defaultValue={patient.city ?? ""} /></label>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Postcode</span><input name="postcode" defaultValue={patient.postcode ?? ""} /></label>
          </div>
          <button type="submit" style={{ justifySelf: "start" }}>Save</button>
        </form>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Consent</h2>
        {CONSENT_PURPOSES.map((p) => {
          const granted = consent[p.key]?.granted === 1;
          return (
            <div key={p.key} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span>{p.label}: <strong>{granted ? "Granted" : "Not granted"}</strong>
                {consent[p.key]?.recorded_at ? <span className="muted-xs"> · {new Date(consent[p.key].recorded_at).toLocaleDateString()}</span> : null}
              </span>
              {granted ? (
                <form action={withdrawConsentAction.bind(null, id, p.key)}><button type="submit" className="btn">Withdraw</button></form>
              ) : (
                <form action={grantConsentAction.bind(null, id, p.key)}><button type="submit" className="btn--primary">Record consent</button></form>
              )}
            </div>
          );
        })}
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Consultation notes</h2>
          <Link href={`/patients/${id}/notes/new`} className="btn--primary">+ Add note</Link>
        </div>
        {notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--border, #eee)", paddingTop: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <strong>{n.note_date}{n.title ? ` · ${n.title}` : ""}</strong>
                <span className="row" style={{ gap: 8 }}>
                  <Link href={`/patients/${id}/notes/${n.id}`}>Edit</Link>
                  <form action={deleteNoteAction.bind(null, id, n.id)}><button type="submit" className="btn">Delete</button></form>
                </span>
              </div>
              {n.body ? <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{n.body}</p> : null}
              {(n.subjective || n.objective || n.assessment || n.plan) ? (
                <dl className="muted-xs" style={{ margin: "6px 0 0" }}>
                  {n.subjective ? <><dt>S</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.subjective}</dd></> : null}
                  {n.objective ? <><dt>O</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.objective}</dd></> : null}
                  {n.assessment ? <><dt>A</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.assessment}</dd></> : null}
                  {n.plan ? <><dt>P</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.plan}</dd></> : null}
                </dl>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Intake</h2>
          <Link href={`/patients/${id}/intake`} className="btn--primary">{intake ? "Edit intake" : "Add intake"}</Link>
        </div>
        {!intake ? (
          <p className="muted">No intake recorded yet.</p>
        ) : (
          <dl className="muted-xs" style={{ margin: 0 }}>
            {intake.chief_concern ? <><dt>Chief concern</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.chief_concern}</dd></> : null}
            {intake.health_history ? <><dt>Health history</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.health_history}</dd></> : null}
            {intake.current_medications ? <><dt>Current medications</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.current_medications}</dd></> : null}
            {intake.current_supplements ? <><dt>Current supplements</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.current_supplements}</dd></> : null}
            {intake.lifestyle ? <><dt>Lifestyle</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.lifestyle}</dd></> : null}
            {intake.goals ? <><dt>Goals</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.goals}</dd></> : null}
          </dl>
        )}
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
