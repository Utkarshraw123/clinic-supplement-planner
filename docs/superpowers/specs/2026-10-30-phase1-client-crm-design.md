# Phase 1 — Client CRM (Contact + Consent + Notes + Intake) Design

**Date:** 2026-10-30
**Status:** Approved scope; building 1a
**Author:** Utkarsh + Claude (Opus 4.8)

## Context

After Phase 0 the app is multi-tenant. The client record is still thin: `patients(name, dob)` + taxonomy attributes (allergy/goal/diet/med_condition). There are no contact details (plans are emailed to an address typed at send-time in `app/plan/[patientId]/prepare/page.tsx`), no clinical consultation notes (only a per-plan `plan_guide`), and the Phase-0e consent model has no UI. Phase 1 turns the thin record into a real client record.

## Decisions (approved)

- **Contact fields:** `email`, `phone`, and postal address (line1, line2, city, postcode). Email becomes the default plan-send recipient.
- **Notes:** dated consultation notes per patient — date, title, free body, plus optional SOAP fields (subjective/objective/assessment/plan). A timeline on the patient page. Separate from `plan_guide`.
- **Intake:** practitioner-entered structured intake (chief concern, history, current meds/supplements, lifestyle, goals). Patient-*filled* intake is deferred to the Phase 2 client portal.

## Decomposition (sub-plans, in order)

- **1a — Client record + contact details + consent UI** *(building now)*: add contact columns to `patients`; expand `createPatient`/`updatePatientBasics`/`getPatient`; contact fields on the new + edit patient forms; a consent panel on the patient page (grant/withdraw, backed by Phase-0e `lib/consent`); and prefill the plan-send email from the patient's stored email.
- **1b — Clinical consultation notes**: `consultation_notes` table (per patient, dated, title/body + optional SOAP); timeline + add/edit UI on the patient page.
- **1c — Structured intake**: an `intake` record per patient (one, editable) with the structured fields above; shown/edited on the patient page.

## Cross-cutting

- All new data is per-tenant (clinical), via the tenant-aware `query`/`execute`.
- Contact + consent changes are audited (reuse `lib/audit`). Consent uses the existing append-only `patient_consents`.
- GDPR export (`lib/gdpr-export.ts`) must include the new contact fields and notes/intake as they land (1a updates it for contact; 1b/1c extend it).

## Testing

TDD per sub-plan: model functions first (contact round-trip, consent on patient, export includes contact), then UI wiring verified in the browser preview.
