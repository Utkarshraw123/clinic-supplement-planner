import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, getPlan } from "@/lib/plans";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { getGuideForEditing } from "@/lib/guide";
import { saveGuideAction, finaliseGuideAction } from "@/app/plan/prepare-actions";

export default async function PrepareGuidePage({ params }: { params: { patientId: string } }) {
  const u = await requireUser();
  const patientId = Number(params.patientId);
  const patient = await getPatient(patientId);
  if (!patient) notFound();
  const planId = await getOrCreateDraftPlan(patientId, u.userId);
  const plan = await getPlan(planId);
  const planHasBlock = plan!.items.some((it) => hasBlock(flagProductForPatient(it.product, patient.attributes)));
  const guide = await getGuideForEditing(plan!, patient);

  const ta = { minHeight: 90 } as const;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row-between">
        <div>
          <p className="eyebrow">Supplement Instruction Guide</p>
          <h1>Prepare for {patient.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>Fill in the recommendations, review the auto-filled sections, then finalise &amp; send.</p>
        </div>
        <Link href={`/plan/${patientId}`} className="muted">← Back to plan</Link>
      </div>

      {plan!.items.length === 0 ? (
        <div className="card"><p className="muted">This plan has no products yet. <Link href={`/plan/${patientId}`}>Add products first →</Link></p></div>
      ) : planHasBlock ? (
        <div className="safety-banner">
          <span className="badge badge--danger" style={{ marginTop: 1 }}>Allergen conflict</span>
          <div>
            <strong>This plan cannot be finalised or sent.</strong>
            <div className="safety-banner__body">
              A product conflicts with {patient.name}&apos;s recorded allergies. <Link href={`/plan/${patientId}`}>Return to the plan</Link> and swap it before preparing the guide.
            </div>
          </div>
        </div>
      ) : (
        <form className="stack" style={{ gap: 16 }}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="patientId" value={patientId} />

          <div className="card stack" style={{ gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="stack" style={{ gap: 5 }}><span>Client name (auto)</span>
                <input value={patient.name} disabled />
              </label>
              <label className="stack" style={{ gap: 5 }}><span>Date of consultation</span>
                <input name="consultationDate" type="date" defaultValue={guide.consultationDate ?? ""} />
              </label>
            </div>
            <label className="stack" style={{ gap: 5 }}><span>Personal intro</span>
              <textarea name="intro" style={ta} defaultValue={guide.intro ?? ""} placeholder="e.g. Here we go, Jane — lovely to see you today…" />
            </label>
            <label className="stack" style={{ gap: 5 }}><span>Next consultation <span className="muted-xs">(optional)</span></span>
              <textarea name="nextConsultation" style={ta} defaultValue={guide.nextConsultation ?? ""} placeholder="e.g. Next consultation, we will discuss a gut cleanse." />
            </label>
          </div>

          <div className="card stack" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 5 }}><span>Lifestyle &amp; Other Recommendations <span className="muted-xs">(optional)</span></span>
              <textarea name="lifestyle" style={ta} defaultValue={guide.lifestyle ?? ""} />
            </label>
            <label className="stack" style={{ gap: 5 }}><span>Dietary Recommendations <span className="muted-xs">(optional)</span></span>
              <textarea name="dietary" style={ta} defaultValue={guide.dietary ?? ""} />
            </label>
          </div>

          <div className="card stack" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 5 }}>
              <span>Supplement Plan <span className="muted-xs">· pre-filled from the plan builder — edit the wording if you like</span></span>
              <textarea name="supplementText" style={{ minHeight: 140 }} defaultValue={guide.supplementText ?? ""} />
            </label>
            <label className="stack" style={{ gap: 5 }}>
              <span>Medications / Hormones / Contraception <span className="muted-xs">· pre-filled from the patient record</span></span>
              <textarea name="medsText" style={ta} defaultValue={guide.medsText ?? ""} />
            </label>
          </div>

          <div className="card card--plain stack" style={{ gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="muted" style={{ whiteSpace: "nowrap" }}>Client email <span className="muted-xs">(optional)</span></label>
              <input name="email" type="email" placeholder="client@email.com" style={{ flex: 1, minWidth: 200 }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" formAction={saveGuideAction}>Save draft</button>
              <button type="submit" formAction={finaliseGuideAction} className="btn--primary">Finalise &amp; send</button>
            </div>
            <p className="muted-xs">
              With an email we generate the branded PDF and send it to the client. Leave it blank to finalise and download
              the PDF (to print or share on WhatsApp) — you can still email it later from the patient&apos;s history.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
