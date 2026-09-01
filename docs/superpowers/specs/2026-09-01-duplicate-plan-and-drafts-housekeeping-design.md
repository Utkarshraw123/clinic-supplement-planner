# Duplicate a plan + Draft-plans housekeeping

**Date:** 2026-09-01 · **Status:** approved

## Goals

1. **Duplicate a plan (same patient).** Re-prescribe from a previous plan without rebuilding: copy every item into a new editable draft, tweak a dose, re-send.
2. **Draft-plans housekeeping.** The dashboard shows a "Draft plans" count but no way in. Make it a worklist: see every draft (which patient, how far along), then **open & send** or **delete** each.

## The hinge: allow multiple drafts per patient

Today the code assumes one draft per patient (`getOrCreateDraftPlan` returns the newest). Both features want more: duplicating makes a *second* draft, and the drafts list must open a *specific* one. So:

- A patient may have multiple `draft` plans.
- The plan builder route accepts an optional **`?plan=<id>`**: if it names a `draft` plan belonging to this patient, the builder opens it; otherwise it falls back to `getOrCreateDraftPlan(patientId)` (unchanged default behaviour).
- New helper `resolveDraftPlanId(patientId, requestedPlanId?)` in `lib/plans.ts` centralises that rule (validates ownership + draft status).

This means duplicating never clobbers existing work, and every draft stays reachable from the drafts list.

## Feature 1 — Duplicate

`lib/plans.ts`:
```ts
duplicatePlan(sourcePlanId: number, authorId?: number): Promise<number>
```
- Reads the source plan's `patient_id` and all `plan_items`.
- Inserts a new `draft` plan for that patient (author = current user).
- Copies every item verbatim: `product_id, dosing_preset_id, dosing_custom_text, chosen_alternative_id, note, duration, order_code, position`.
- Returns the new draft's id. Source plan is untouched (finalised stays finalised).
- Does **not** copy `plan_guide` free-text — the guide is regenerated on Prepare so consultation date / intro aren't stale. The Supplement Plan text re-derives from the copied items.

**Trigger + flow:**
- `lib/delivery.ts listSnapshotsForPatient` gains `plan_id` in its SELECT.
- The patient **History** page adds a **"Duplicate → new draft"** button per finalised plan → `duplicatePlanAction` → `duplicatePlan(plan_id, user)` → `redirect('/plan/{patientId}?plan={newId}')`, landing in the builder on the copy.
- The drafts list (below) also offers Duplicate on each row.
- "Extra dosage" is a manual edit after landing in the builder — no automatic dose change.

## Feature 2 — Draft-plans housekeeping

`lib/plans.ts`:
```ts
listDraftPlans(): Promise<{ planId; patientId; patientName; itemCount; updatedAt; authorName }[]>
deletePlan(planId: number): Promise<void>   // batch: plan_items → plan_guide → plans
```
- `deletePlan` removes the draft and its items/guide in one write batch. It does **not** touch the patient, other plans, or snapshots (drafts have none). Called only on drafts from the UI.

**UI:**
- Dashboard: the **"Draft plans"** stat card becomes a `Link` to **`/plans/drafts`**.
- New page `app/plans/drafts/page.tsx` (`requireUser`): a table — **Patient · Items · Last updated · Built by** — with per-row actions **Open** (`/plan/{patientId}?plan={planId}`), **Duplicate**, and **Delete** (`deletePlanAction`, native confirm, no undo — matching the patient Danger Zone). Empty state + a heading count so it reads as a tidy worklist. Reachable by any authenticated user; delete is not admin-gated (small clinic).

`app/plans/actions.ts` (new): `deletePlanAction` (revalidates `/plans/drafts` + `/dashboard`). `duplicatePlanAction` lives in `app/plan/actions.ts` next to the other plan actions.

## Tests (TDD, Vitest — `test/plans.test.ts`)

- `duplicatePlan` copies all item fields (incl. duration/order_code/note/alternative) into a **new** draft; source plan unchanged; new plan has `status='draft'` and the same `patient_id`.
- `deletePlan` removes the plan + its items; the patient and a second unrelated plan survive.
- `resolveDraftPlanId` returns the requested id when it's a draft of that patient, else the patient's default draft.
- `listDraftPlans` returns only drafts, with correct item counts and patient names.

## Out of scope (YAGNI)

Cross-patient duplicate (chosen: same patient; "Save as protocol" covers templates), copying guide free-text, bulk delete, and a sidebar nav entry (the dashboard card link is the entry point).

## Verify

`npx vitest run` green · `npm run build` clean · live: dashboard card → drafts list; Open a draft; Duplicate a finalised plan from History → lands on a new draft with all items+dosing+duration+code; Delete a draft removes it and the count drops. No prod migration needed (no new columns).
