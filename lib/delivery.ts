import { execute, query } from "@/lib/db";
import { getPlan, finalisePlan } from "@/lib/plans";
import { getPatient } from "@/lib/patients";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { buildPlanPdfData, renderPlanPdf } from "@/lib/pdf";
import { getClinicSettings } from "@/lib/settings";
import { sendPlanEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

export async function finaliseAndSend(input: { planId: number; email: string; actorId?: number }): Promise<{ snapshotId: number; mocked: boolean }> {
  const plan = await getPlan(input.planId);
  if (!plan) throw new Error("Plan not found");
  const patient = await getPatient(plan.patientId);
  if (!patient) throw new Error("Patient not found");

  // Safety re-check against the CURRENT patient profile.
  for (const it of plan.items) {
    if (hasBlock(flagProductForPatient(it.product, patient.attributes))) {
      throw new Error("Cannot send: plan has a blocked item");
    }
  }

  const pdfData = await buildPlanPdfData(plan, patient);
  const pdf = await renderPlanPdf(pdfData);
  const settings = await getClinicSettings();

  const rs = await execute(
    `INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64, sent_to_email, sent_at, sent_by)
     VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    [input.planId, JSON.stringify(pdfData), pdf.toString("base64"), input.email, input.actorId ?? null]
  );
  const snapshotId = Number(rs.lastInsertRowid);

  await finalisePlan(input.planId);
  const { mocked } = await sendPlanEmail({ to: input.email, from: settings.email_from ?? "", pdf, patientName: patient.name });
  await recordAudit({ actorId: input.actorId, action: "finalised_and_sent", entity: "plan", entityId: input.planId, detail: `${plan.items.length} items → ${input.email}${mocked ? " (mock)" : ""}` });

  return { snapshotId, mocked };
}

export async function listSnapshots(planId: number): Promise<{ id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]> {
  return query("SELECT id, sent_to_email, sent_at, created_at FROM plan_snapshots WHERE plan_id = ? ORDER BY created_at DESC", [planId]);
}

export async function listSnapshotsForPatient(patientId: number): Promise<{ id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]> {
  return query(
    `SELECT s.id, s.sent_to_email, s.sent_at, s.created_at
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
