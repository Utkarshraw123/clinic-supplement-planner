import { query, execute } from "@/lib/db";

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

export async function setPatientAttributes(patientId: number, attrs: { termId: number; attrType: AttrType }[]): Promise<void> {
  await execute("DELETE FROM patient_attributes WHERE patient_id = ?", [patientId]);
  for (const a of attrs) {
    await execute(
      "INSERT OR IGNORE INTO patient_attributes (patient_id, taxonomy_term_id, attr_type) VALUES (?, ?, ?)",
      [patientId, a.termId, a.attrType]
    );
  }
}
