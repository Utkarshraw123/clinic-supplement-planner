# Prescription item — Duration + Order code (with an elevated item UI)

**Date:** 2026-08-27 · **Status:** approved (design + UI-polish requirement)

## Goal

When building a patient's prescription, let the practitioner set, **per supplement item**:

1. **Duration** — a fixed dropdown: `1 week`, `2 weeks`, `3 weeks`, `4 weeks`, `1 month`, `3 months`, `6 months`, `Finish off, no repeat` (blank = unset).
2. **Order code** — a free-text discount/coupon code (brands issue these), printed next to that product's buy link on the client guide.

Plus: the per-item controls in the plan builder currently render as three separate bare mini-forms (alternative / dosing / note). Consolidate them into **one cohesive, well-designed “prescription details” card** with labelled fields and a single Save.

## Data model

Two nullable columns on `plan_items` (mirrors the existing `note` column — simple per-item strings, no new table):

- `plan_items.duration TEXT`
- `plan_items.order_code TEXT`

Added idempotently in `scripts/migrate.ts` via the existing `ensureColumn` helper. **Run `migrate` on prod BEFORE deploying the code** (raw SQL, no boot-time migration → the app 500s on a missing column otherwise).

The duration list is a controlled constant exported from `lib/plans.ts`:
```ts
export const DURATION_OPTIONS = ["1 week","2 weeks","3 weeks","4 weeks","1 month","3 months","6 months","Finish off, no repeat"] as const;
```
Stored as the label string; blank/unset = `null`. No validation table (YAGNI) — the UI only offers these values.

## lib/plans.ts

- `PlanItemDetail` gains `duration: string | null` and `orderCode: string | null`.
- `getPlan` SELECT adds `duration, order_code`, mapped onto each item.
- New setters (parallel to `setItemNote`, each a single UPDATE, individually testable):
  - `setItemDuration(itemId, duration: string | null)` — trims; empty → null.
  - `setItemOrderCode(itemId, code: string | null)` — trims; empty → null.

## Guide / PDF output — `lib/guide.ts`

`defaultSupplementText` composes each line as:

```
N. {name} — {dosing} · {note} · {durationText} · order code: {code}{altSuffix}
```

- `durationText`: for `Finish off, no repeat` render it verbatim (lowercased: `finish off, no repeat`); otherwise `for {duration}` (e.g. `for 3 months`).
- `order code: {code}` only when a code is set.
- The existing `altSuffix` (`(an alternative format is available on request)`) and the `description` sub-line are unchanged and stay last.
- Each segment is omitted when its value is blank (no empty ` · ·`).

This text is the editable default on the Prepare page and prints in the PDF, where `attachLinksToLines` still matches the product name to append the gold "Buy online" link — so the code sits right beside the buy link, as intended.

## Plan builder UI — `app/plan/[patientId]/page.tsx` + new `components/PlanItemFields.tsx`

Replace the two stacked mini-forms (dosing, note) with **one client component**, `PlanItemFields`, rendering a labelled 2-column responsive grid inside the item card:

- **Dosing** — preset `<select>` + custom-text `<input>` (custom overrides preset, unchanged semantics).
- **Duration** — `<select>` of `DURATION_OPTIONS` (blank default), defaulted to the saved value.
- **Order code** — `<input>`, defaulted to the saved value.
- **Note** — full-width `<input>` (“Comment for this product — appears on the guide”).
- One **Save** button (bottom-right of the grid), calling a single new action `saveItemFieldsAction`.

The alternative-format `<select>` stays as its own small form (only shown when alternatives exist) but is restyled to sit as a labelled field above the grid for visual consistency. Remove/flags/header rows unchanged.

`saveItemFieldsAction(formData)` (in `app/plan/actions.ts`): `requireUser`, then persist dosing (`setItemDosing`), duration (`setItemDuration`), order code (`setItemOrderCode`) and note (`setItemNote`) for the item, then `revalidatePath`. The old `saveDosingAction` / `saveItemNoteAction` are superseded and removed (only the plan page used them).

### Styling (globals.css, new classes)

- `.rx-fields` — `display:grid; grid-template-columns:1fr 1fr; gap:12px 16px;` → 1 column under 640px.
- `.field` / `.field--full` — column flex, 5px gap; full spans both columns.
- `.field__label` — 11px, uppercase, `letter-spacing:.06em`, weight 600, `color:var(--ink-2)` (matches `.table th`).
- `.rx-actions` — flex, right-aligned Save.

All colors/borders from existing tokens (`--sand-border`, `--ink-2`, `--radius-ctl`). No new palette.

## Out of scope (YAGNI)

- Protocol templates (`protocol_items`) — unchanged; duration/code are patient-specific, not reusable template values.
- No product-level default order code (per-item entry was the chosen model).
- No change to snapshot/finalise logic — it already renders from the guide’s `supplement_text`.

## Tests (TDD, Vitest)

- `test/plans.test.ts`: `setItemDuration` + `setItemOrderCode` persist and `getPlan` returns them; empty string → null.
- `test/guide.test.ts`: `defaultSupplementText` includes `for 3 months`, `order code: WN10`, and renders `finish off, no repeat` (not `for Finish off…`); omits segments when unset.

## Verify

`npx vitest run` (all green) · `npm run build` clean · migrate prod · deploy · live check: add an item, set duration + code, Prepare guide shows the composed line, finalise → PDF shows duration + code beside the buy link.
