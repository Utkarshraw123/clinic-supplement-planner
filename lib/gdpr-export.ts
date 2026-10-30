import { query } from "@/lib/db";
import { listConsents, type ConsentRow } from "@/lib/consent";
import { listNotesForPatient, type NoteRow } from "@/lib/consultation-notes";
import { listAuditForEntity } from "@/lib/audit";

type PatientRow = { id: number; name: string; dob: string; created_at: string; email: string | null; phone: string | null; address1: string | null; address2: string | null; city: string | null; postcode: string | null };

export type PatientExport = {
  exported_at: string;
  patient: PatientRow | null;
  attributes: { taxonomy_term_id: number; attr_type: string; label: string }[];
  consents: ConsentRow[];
  notes: NoteRow[];
  plans: {
    id: number; status: string; created_at: string;
    items: { product_id: number; product_name: string; note: string | null; dosing: string | null; position: number }[];
    guide: Record<string, unknown> | null;
    snapshots: { id: number; sent_to_email: string | null; sent_at: string | null; frozen_json: unknown }[];
  }[];
  audit: { action: string; detail: string | null; created_at: string; actor_id: number | null }[];
};

export async function exportPatientData(patientId: number): Promise<PatientExport> {
  const patient = (await query<PatientRow>("SELECT id, name, dob, created_at, email, phone, address1, address2, city, postcode FROM patients WHERE id = ?", [patientId]))[0] ?? null;
  const exported_at = new Date().toISOString();
  if (!patient) {
    return { exported_at, patient: null, attributes: [], consents: [], notes: [], plans: [], audit: [] };
  }

  const attributes = await query<{ taxonomy_term_id: number; attr_type: string; label: string }>(
    `SELECT pa.taxonomy_term_id, pa.attr_type, t.label
       FROM patient_attributes pa JOIN taxonomy_terms t ON t.id = pa.taxonomy_term_id
      WHERE pa.patient_id = ?`,
    [patientId]
  );

  const consents = await listConsents(patientId);
  const notes = await listNotesForPatient(patientId);
  const audit = await listAuditForEntity("patient", patientId);

  const planRows = await query<{ id: number; status: string; created_at: string }>(
    "SELECT id, status, created_at FROM plans WHERE patient_id = ? ORDER BY id",
    [patientId]
  );

  const plans: PatientExport["plans"] = [];
  for (const p of planRows) {
    const items = await query<{ product_id: number; product_name: string; note: string | null; dosing: string | null; position: number }>(
      `SELECT pi.product_id, pr.name AS product_name, pi.note,
              COALESCE(pi.dosing_custom_text, dp.text) AS dosing, pi.position
         FROM plan_items pi
         JOIN products pr ON pr.id = pi.product_id
         LEFT JOIN dosing_presets dp ON dp.id = pi.dosing_preset_id
        WHERE pi.plan_id = ? ORDER BY pi.position`,
      [p.id]
    );
    const guide = (await query<Record<string, unknown>>("SELECT * FROM plan_guide WHERE plan_id = ?", [p.id]))[0] ?? null;
    const snapRows = await query<{ id: number; sent_to_email: string | null; sent_at: string | null; frozen_json: string }>(
      "SELECT id, sent_to_email, sent_at, frozen_json FROM plan_snapshots WHERE plan_id = ? ORDER BY id",
      [p.id]
    );
    const snapshots = snapRows.map((s) => ({
      id: s.id,
      sent_to_email: s.sent_to_email,
      sent_at: s.sent_at,
      frozen_json: safeParse(s.frozen_json),
    }));
    plans.push({ id: p.id, status: p.status, created_at: p.created_at, items, guide, snapshots });
  }

  return { exported_at, patient, attributes, consents, notes, plans, audit };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
