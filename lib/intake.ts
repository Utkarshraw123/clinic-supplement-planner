import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type IntakeInput = {
  chiefConcern?: string; healthHistory?: string;
  currentMedications?: string; currentSupplements?: string;
  lifestyle?: string; goals?: string; updatedBy?: number;
};

export type IntakeRow = {
  patient_id: number;
  chief_concern: string | null; health_history: string | null;
  current_medications: string | null; current_supplements: string | null;
  lifestyle: string | null; goals: string | null;
  updated_at: string; updated_by: number | null;
};

const norm = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function getIntake(patientId: number): Promise<IntakeRow | null> {
  const rows = await query<IntakeRow>("SELECT * FROM patient_intake WHERE patient_id = ?", [patientId]);
  return rows[0] ?? null;
}

export async function saveIntake(patientId: number, input: IntakeInput): Promise<void> {
  await execute(
    `INSERT INTO patient_intake (patient_id, chief_concern, health_history, current_medications, current_supplements, lifestyle, goals, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(patient_id) DO UPDATE SET
       chief_concern=excluded.chief_concern, health_history=excluded.health_history,
       current_medications=excluded.current_medications, current_supplements=excluded.current_supplements,
       lifestyle=excluded.lifestyle, goals=excluded.goals,
       updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
    [patientId, norm(input.chiefConcern), norm(input.healthHistory), norm(input.currentMedications), norm(input.currentSupplements), norm(input.lifestyle), norm(input.goals), input.updatedBy ?? null]
  );
  await recordAudit({ actorId: input.updatedBy, action: "intake_updated", entity: "patient", entityId: patientId, detail: "intake saved" });
}
