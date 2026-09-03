import { execute, query } from "@/lib/db";
import { getPlan, finalisePlan } from "@/lib/plans";
import { getPatient } from "@/lib/patients";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { buildGuidePdfData, renderPlanPdf } from "@/lib/pdf";
import { getGuideForEditing, buildSupplementRows } from "@/lib/guide";
import { getClinicSettings } from "@/lib/settings";
import { sendPlanEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

// Finalise a plan into a downloadable snapshot WITHOUT emailing it. The practitioner
// can then download the PDF (e.g. to send on WhatsApp) or email it later.
export async function finalisePlanToSnapshot(input: { planId: number; actorId?: number }): Promise<{ snapshotId: number }> {
  const plan = await getPlan(input.planId);
  if (!plan) throw new Error("Plan not found");
  if (plan.items.length === 0) throw new Error("Cannot finalise an empty plan");
  const patient = await getPatient(plan.patientId);
  if (!patient) throw new Error("Patient not found");

  // Hard safety gate: an allergen conflict blocks finalisation outright.
  for (const it of plan.items) {
    if (hasBlock(flagProductForPatient(it.product, patient.attributes))) {
      throw new Error("Cannot finalise: plan has a blocked item (allergen conflict)");
    }
  }

  const guide = await getGuideForEditing(plan, patient);
  // The supplement plan is built straight from the plan items (single source of truth)
  // and laid out as a table — brand, size, dosing, duration, promo code, and every
  // vendor's buy link. This is what keeps the PDF in lock-step with the plan.
  const supplements = buildSupplementRows(plan);
  const pdfData = buildGuidePdfData(patient, guide, supplements);
  const settings = await getClinicSettings();
  const pdf = await renderPlanPdf(pdfData, settings.letterhead_template);

  const rs = await execute(
    `INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64, sent_to_email, sent_at, sent_by)
     VALUES (?, ?, ?, NULL, NULL, ?)`,
    [input.planId, JSON.stringify(pdfData), pdf.toString("base64"), input.actorId ?? null]
  );
  const snapshotId = Number(rs.lastInsertRowid);

  await finalisePlan(input.planId);
  await recordAudit({ actorId: input.actorId, action: "finalised", entity: "plan", entityId: input.planId, detail: `${plan.items.length} items (download only)` });
  return { snapshotId };
}

// Email an already-finalised snapshot to a client address.
export async function sendSnapshotEmail(input: { snapshotId: number; email: string; actorId?: number }): Promise<{ mocked: boolean }> {
  const rows = await query<{ pdf_base64: string; plan_id: number }>(
    "SELECT pdf_base64, plan_id FROM plan_snapshots WHERE id = ?", [input.snapshotId]
  );
  if (!rows[0]) throw new Error("Snapshot not found");
  const pdf = Buffer.from(rows[0].pdf_base64, "base64");
  const plan = await getPlan(rows[0].plan_id);
  const patient = plan ? await getPatient(plan.patientId) : null;
  const settings = await getClinicSettings();

  const { mocked } = await sendPlanEmail({ to: input.email, from: settings.email_from ?? "", pdf, patientName: patient?.name ?? "" });
  await execute(
    "UPDATE plan_snapshots SET sent_to_email = ?, sent_at = datetime('now'), sent_by = COALESCE(sent_by, ?) WHERE id = ?",
    [input.email, input.actorId ?? null, input.snapshotId]
  );
  await recordAudit({ actorId: input.actorId, action: "sent", entity: "snapshot", entityId: input.snapshotId, detail: `→ ${input.email}${mocked ? " (mock)" : ""}` });
  return { mocked };
}

// Convenience: finalise AND email in one step (email required). Used by the plan
// builder when a client email is supplied, and by the delivery tests.
export async function finaliseAndSend(input: { planId: number; email: string; actorId?: number }): Promise<{ snapshotId: number; mocked: boolean }> {
  const { snapshotId } = await finalisePlanToSnapshot({ planId: input.planId, actorId: input.actorId });
  const { mocked } = await sendSnapshotEmail({ snapshotId, email: input.email, actorId: input.actorId });
  return { snapshotId, mocked };
}

export async function listSnapshots(planId: number): Promise<{ id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]> {
  return query("SELECT id, sent_to_email, sent_at, created_at FROM plan_snapshots WHERE plan_id = ? ORDER BY created_at DESC", [planId]);
}

export async function listSnapshotsForPatient(patientId: number): Promise<{ id: number; plan_id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]> {
  return query(
    `SELECT s.id, s.plan_id, s.sent_to_email, s.sent_at, s.created_at
     FROM plan_snapshots s JOIN plans p ON p.id = s.plan_id
     WHERE p.patient_id = ? ORDER BY s.created_at DESC`,
    [patientId]
  );
}

export async function getSnapshotPdf(snapshotId: number): Promise<Buffer | null> {
  const rows = await query<{ pdf_base64: string }>("SELECT pdf_base64 FROM plan_snapshots WHERE id = ?", [snapshotId]);
  if (!rows[0]) return null;
  return Buffer.from(rows[0].pdf_base64, "base64");
}
