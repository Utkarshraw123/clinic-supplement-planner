import { query, execute } from "@/lib/db";
import type { PlanDetail } from "@/lib/plans";
import type { PatientDetail } from "@/lib/patients";

export type PlanGuide = {
  consultationDate: string | null;
  intro: string | null;
  nextConsultation: string | null;
  lifestyle: string | null;
  dietary: string | null;
  supplementText: string | null;
  medsText: string | null;
};

const EMPTY: PlanGuide = {
  consultationDate: null, intro: null, nextConsultation: null,
  lifestyle: null, dietary: null, supplementText: null, medsText: null,
};

// Numbered supplement list from the structured plan items — the editable starting point.
// Each product's saved default note ("only take at night", …) auto-appends to its line,
// and its description (if any) becomes a short line beneath it.
export function defaultSupplementText(plan: PlanDetail): string {
  if (plan.items.length === 0) return "";
  return plan.items
    .map((it, i) => {
      const dosing = it.dosingText?.trim();
      // Per-product comment set on the plan (it.note) takes precedence; otherwise the
      // product's saved default note. Either way it's editable here before sending.
      const note = (it.note?.trim()) || it.product.default_note?.trim();
      const desc = it.product.description?.trim();
      const alt = it.chosenAlternativeId ? " (an alternative format is available on request)" : "";
      const head = `${i + 1}. ${it.product.name}${dosing ? ` — ${dosing}` : ""}${note ? ` · ${note}` : ""}${alt}`;
      return desc ? `${head}\n${desc}` : head;
    })
    .join("\n");
}

// Bullet list of the patient's recorded meds/conditions — the editable starting point.
export function defaultMedsText(patient: PatientDetail): string {
  const meds = patient.attributes.filter((a) => a.attrType === "med_condition");
  if (meds.length === 0) return "";
  return meds.map((m) => `- ${m.label}`).join("\n");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPlanGuide(planId: number): Promise<PlanGuide | null> {
  const rows = await query<{
    consultation_date: string | null; intro: string | null; next_consultation: string | null;
    lifestyle: string | null; dietary: string | null; supplement_text: string | null; meds_text: string | null;
  }>(
    `SELECT consultation_date, intro, next_consultation, lifestyle, dietary, supplement_text, meds_text
     FROM plan_guide WHERE plan_id = ?`, [planId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    consultationDate: r.consultation_date, intro: r.intro, nextConsultation: r.next_consultation,
    lifestyle: r.lifestyle, dietary: r.dietary, supplementText: r.supplement_text, medsText: r.meds_text,
  };
}

export async function savePlanGuide(planId: number, g: PlanGuide): Promise<void> {
  await execute(
    `INSERT INTO plan_guide (plan_id, consultation_date, intro, next_consultation, lifestyle, dietary, supplement_text, meds_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(plan_id) DO UPDATE SET
       consultation_date = excluded.consultation_date,
       intro = excluded.intro,
       next_consultation = excluded.next_consultation,
       lifestyle = excluded.lifestyle,
       dietary = excluded.dietary,
       supplement_text = excluded.supplement_text,
       meds_text = excluded.meds_text,
       updated_at = datetime('now')`,
    [planId, g.consultationDate, g.intro, g.nextConsultation, g.lifestyle, g.dietary, g.supplementText, g.medsText]
  );
}

// The guide as it should appear in the editor: saved values, with sensible defaults
// filled in where the practitioner hasn't yet typed anything.
export async function getGuideForEditing(plan: PlanDetail, patient: PatientDetail): Promise<PlanGuide> {
  const saved = (await getPlanGuide(plan.id)) ?? EMPTY;
  return {
    consultationDate: saved.consultationDate ?? todayIso(),
    intro: saved.intro ?? "",
    nextConsultation: saved.nextConsultation ?? "",
    lifestyle: saved.lifestyle ?? "",
    dietary: saved.dietary ?? "",
    supplementText: saved.supplementText ?? defaultSupplementText(plan),
    medsText: saved.medsText ?? defaultMedsText(patient),
  };
}
