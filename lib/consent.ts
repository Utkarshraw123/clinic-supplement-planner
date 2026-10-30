import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type ConsentRow = {
  id: number;
  patient_id: number;
  purpose: string;
  granted: number;
  version: string;
  recorded_by: number | null;
  recorded_at: string;
};

export async function recordConsent(input: { patientId: number; purpose: string; version: string; actorId?: number }): Promise<void> {
  await execute(
    "INSERT INTO patient_consents (patient_id, purpose, granted, version, recorded_by) VALUES (?, ?, 1, ?, ?)",
    [input.patientId, input.purpose, input.version, input.actorId ?? null]
  );
  await recordAudit({ actorId: input.actorId, action: "consent_granted", entity: "patient", entityId: input.patientId, detail: `${input.purpose} (${input.version})` });
}

export async function withdrawConsent(input: { patientId: number; purpose: string; actorId?: number }): Promise<void> {
  const latest = await query<ConsentRow>(
    "SELECT * FROM patient_consents WHERE patient_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
    [input.patientId, input.purpose]
  );
  const version = latest[0]?.version ?? "n/a";
  await execute(
    "INSERT INTO patient_consents (patient_id, purpose, granted, version, recorded_by) VALUES (?, ?, 0, ?, ?)",
    [input.patientId, input.purpose, version, input.actorId ?? null]
  );
  await recordAudit({ actorId: input.actorId, action: "consent_withdrawn", entity: "patient", entityId: input.patientId, detail: input.purpose });
}

export async function listConsents(patientId: number): Promise<ConsentRow[]> {
  return query<ConsentRow>("SELECT * FROM patient_consents WHERE patient_id = ? ORDER BY id DESC", [patientId]);
}

export async function latestConsentByPurpose(patientId: number): Promise<Record<string, ConsentRow>> {
  const rows = await query<ConsentRow>("SELECT * FROM patient_consents WHERE patient_id = ? ORDER BY id ASC", [patientId]);
  const out: Record<string, ConsentRow> = {};
  for (const r of rows) out[r.purpose] = r; // ascending, so last write per purpose wins
  return out;
}
