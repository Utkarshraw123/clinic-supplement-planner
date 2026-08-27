import { query, execute, getDb } from "@/lib/db";

export type AttrType = "allergy"|"goal"|"diet"|"med_condition";
export type PatientAttr = { termId: number; label: string; attrType: AttrType };
export type PatientDetail = { id: number; name: string; dob: string; attributes: PatientAttr[] };

export async function createPatient(input: { name: string; dob: string; createdBy?: number }): Promise<number> {
  const rs = await execute(
    "INSERT INTO patients (name, dob, created_by) VALUES (?, ?, ?)",
    [input.name.trim(), input.dob.trim(), input.createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updatePatientBasics(id: number, input: { name: string; dob: string }): Promise<void> {
  await execute("UPDATE patients SET name = ?, dob = ? WHERE id = ?", [input.name.trim(), input.dob.trim(), id]);
}

export async function listPatients(): Promise<{ id: number; name: string; dob: string }[]> {
  return query("SELECT id, name, dob FROM patients ORDER BY name");
}

export async function getPatient(id: number): Promise<PatientDetail | null> {
  const base = await query<{ id: number; name: string; dob: string }>("SELECT id, name, dob FROM patients WHERE id = ?", [id]);
  if (!base[0]) return null;
  const attributes = await query<PatientAttr>(
    `SELECT t.id AS termId, t.label AS label, pa.attr_type AS attrType
     FROM patient_attributes pa JOIN taxonomy_terms t ON t.id = pa.taxonomy_term_id
     WHERE pa.patient_id = ?`, [id]
  );
  return { ...base[0], attributes };
}

// GDPR right-to-erasure: permanently remove a patient and EVERYTHING linked to
// them — clinical attributes, plans, plan items, guides, and the sent snapshots
// (which hold the frozen PDF + the client's email). Also purges the audit-log
// rows for those plans/snapshots, since the "sent" entry records the email.
// Runs as one write transaction so it's all-or-nothing.
export async function deletePatient(id: number): Promise<void> {
  const planIds = (await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ?", [id])).map((r) => r.id);
  const stmts: { sql: string; args: number[] }[] = [];

  if (planIds.length) {
    const ph = planIds.map(() => "?").join(",");
    const snapIds = (await query<{ id: number }>(`SELECT id FROM plan_snapshots WHERE plan_id IN (${ph})`, planIds)).map((r) => r.id);
    stmts.push({ sql: `DELETE FROM audit_events WHERE entity = 'plan' AND entity_id IN (${ph})`, args: planIds });
    if (snapIds.length) {
      const sph = snapIds.map(() => "?").join(",");
      stmts.push({ sql: `DELETE FROM audit_events WHERE entity = 'snapshot' AND entity_id IN (${sph})`, args: snapIds });
    }
    stmts.push({ sql: `DELETE FROM plan_snapshots WHERE plan_id IN (${ph})`, args: planIds });
    stmts.push({ sql: `DELETE FROM plan_items WHERE plan_id IN (${ph})`, args: planIds });
    stmts.push({ sql: `DELETE FROM plan_guide WHERE plan_id IN (${ph})`, args: planIds });
    stmts.push({ sql: `DELETE FROM plans WHERE patient_id = ?`, args: [id] });
  }
  stmts.push({ sql: `DELETE FROM patient_attributes WHERE patient_id = ?`, args: [id] });
  stmts.push({ sql: `DELETE FROM patients WHERE id = ?`, args: [id] });

  await getDb().batch(stmts, "write");
}

export async function setPatientAttributes(patientId: number, attrs: { termId: number; attrType: AttrType }[]): Promise<void> {
  await execute("DELETE FROM patient_attributes WHERE patient_id = ?", [patientId]);
  for (const a of attrs) {
    await execute(
      "INSERT OR IGNORE INTO patient_attributes (patient_id, taxonomy_term_id, attr_type) VALUES (?, ?, ?)",
      [patientId, a.termId, a.attrType]
    );
  }
}
