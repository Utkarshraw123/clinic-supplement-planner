# Supplement Instruction Guide — Design

**Date:** 2026-08-26 · **Status:** approved (user delegated remaining calls)

## Goal
Replace the generic plan PDF with Lorna Driver-Davies's branded **"Supplement Instruction Guide"**, and give the practitioner a step to fill the recommendation fields before finalising. Some fields auto-populate, some are practitioner-entered; the practitioner reviews/edits everything, then finalises + sends (email optional, download always).

## PDF sections (in the template's order)
Gold header banner (image) → body → gold contact footer (image).

| # | Section | Source | Optional |
|---|---------|--------|----------|
| 1 | Name of client | auto (patient.name) | no |
| 2 | Date of consultation | practitioner (defaults today) | no |
| 3 | Personal intro | practitioner | no |
| 4 | Next consultation note | practitioner | yes |
| 5 | Lifestyle & Other Recommendations | practitioner | yes |
| 6 | Dietary Recommendations | practitioner | yes |
| 7 | Supplement Plan | auto from builder items+dosing, **editable** | no |
| 8 | Medications/Hormones/Contraception | auto from patient meds, **editable** | yes |

Empty optional sections are omitted from the PDF. Section order matches the source template (intro + next-consultation sit above the recommendation sections).

## Workflow
1. **Plan builder** (`/plan/[patientId]`) unchanged — add products + dosing; allergen conflicts hard-block. The finalise card becomes a **"Prepare guide →"** button (enabled only when ≥1 item AND no allergen block).
2. **Prepare & send** (`/plan/[patientId]/prepare`) — one screen:
   - fields #2–#8 (with #7 pre-filled from builder items, #8 pre-filled from patient meds, both editable),
   - **Save draft** (upsert to `plan_guide`),
   - optional client **email** box,
   - **Finalise & send** → re-check allergen safety → render branded PDF → snapshot (frozen_json includes all guide fields) → optional email → redirect to history.

Safety: the allergen guarantee is enforced on the *structured* plan items (builder). The editable supplement text is presentation only.

## Data model
New table (added to `lib/schema.sql`, created by `runMigrations`):
```sql
CREATE TABLE IF NOT EXISTS plan_guide (
  plan_id INTEGER PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  consultation_date TEXT,
  intro TEXT,
  next_consultation TEXT,
  lifestyle TEXT,
  dietary TEXT,
  supplement_text TEXT,
  meds_text TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Modules
- `lib/guide.ts`:
  - `getPlanGuide(planId)` — raw row or null.
  - `savePlanGuide(planId, fields)` — upsert.
  - `defaultSupplementText(plan)` — numbered list from items: `N. <name> — <dosing>` (+ alternative note).
  - `defaultMedsText(patient)` — bullet list from `med_condition` attributes.
  - `getGuideForEditing(planId)` — guide with defaults filled where empty (date=today, supplement_text=default, meds_text=default).
- `lib/pdf.tsx`:
  - `buildGuidePdfData(plan, patient, guide)` — maps to `GuidePdfData`.
  - `renderPlanPdf(data)` — new branded layout (gold header/footer images, sections above).
- `lib/pdf-assets.ts` — the two brand images as base64 data URIs (extracted from the .docx), embedded so serverless bundling is safe (same lesson as pdfkit fonts).
- `lib/delivery.ts` — `finalisePlanToSnapshot` loads the guide (`getGuideForEditing`) and passes it to the PDF builder; frozen_json carries the guide.

## Pages / actions
- `app/plan/[patientId]/prepare/page.tsx` (server) + `components/GuideForm.tsx` (client).
- `app/plan/prepare-actions.ts`: `saveGuideAction`, `finaliseGuideAction`.
- Plan builder finalise card → "Prepare guide →" link.

## Branding
Lorna's gold header + footer images are embedded directly (this deployment is her clinic). Multi-clinic letterhead uploads are out of scope (YAGNI); revisit if the app is ever run for another clinic.

## Testing (TDD)
- `lib/guide.ts`: default formatters, save/get roundtrip, `getGuideForEditing` defaults.
- `lib/pdf.tsx`: `buildGuidePdfData` field mapping; render produces `%PDF-`.
- Existing delivery/finalise tests keep passing (finalise works with default guide when none saved).

## Deploy
Prod DB needs the new table: run `TURSO_… npm run migrate` against `clinic-supplement-planner` (idempotent). Then deploy. PDF font-tracing fix (commit 1491b81) already handles pdfkit.
