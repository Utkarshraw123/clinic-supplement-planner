# Lorna feedback round 2 — design

Date: 2026-10-19 · Status: approved in brainstorming, pending spec review

Lorna sent nine items after using the planner. This spec covers the seven that need
work, grouped into four independently shippable workstreams (A → D). Items 4 (pack
size) and 6 (add/delete products) need no build: pack size is already a manual choice,
and both "Catalog → Add product" and "Remove from catalogue" already exist.

| # | Lorna's ask | Workstream |
|---|---|---|
| 1 | Edit the full list of dosing presets (add/delete) | C |
| 2 | "See notes below" duration option | A |
| 3 | Discount code as a managed dropdown (add/delete) | C |
| 4 | 60 vs 90 pack size | none (already manual) |
| 5 | Consultation date on the plan; no timestamps on the document; Word download | A + D |
| 6 | Add / delete products herself | none (already exists — show Lorna where) |
| 7 | Duplicate a plan with every field, incl. page-2 notes | B |
| 8 | Save a complete plan (both pages) as a protocol | B |
| 9 | Reusable dietary protocols | C |

## Decisions made in brainstorming

- **Word export is added alongside the PDF**, not instead of it. Email still sends the PDF.
- **Dietary protocols are reusable named templates** inserted into the existing Dietary
  section (not a new heading, not a rename).
- **Discount codes are per brand**, with one optional default per brand.
- **Applying a protocol to a plan merges page-2 text:** empty sections are filled; sections
  that already have text get the protocol text appended underneath. Nothing is overwritten.
- **Duplicating a plan copies everything except the consultation date**, which is left
  blank for the new consultation.
- **Word is generated natively** with the `docx` npm library (real Word header/footer,
  headings and table), not via HTML or PDF conversion.

---

## Workstream A — quick fixes

### A1. "See notes below" duration (item 2)
- Add `"See notes below"` to `DURATION_OPTIONS` in `lib/durations.ts`.
- `buildSupplementRows` (lib/guide.ts) currently prefixes every duration except
  "Finish off…" with "for ". Change the rule so non-time options render verbatim:
  "Finish off, no repeat" and "See notes below" print as-is; time spans print as
  "for 3 months". Implement as a small `formatDuration(d)` helper so the rule is tested
  in one place.

### A2. Consultation date on the document (item 5)
Today the Prepare page already has an editable **Date of consultation** (defaults to
today) stored in `plan_guide.consultation_date`, and plan creation/edit timestamps live
separately on `plans`. The document prints the raw ISO date ("2026-08-26").
- Add `formatConsultationDate(value)` → "26 August 2026". Accepts an ISO `YYYY-MM-DD`
  string; any other non-empty string is returned unchanged; empty → empty. Never emits a
  time.
- Use it wherever the consultation date is printed: PDF (`lib/pdf.tsx`) and Word (D).
- Relabel the Prepare field "Date of consultation (shown on the plan)" so it's clear this
  is the date that prints, while the plan's own timestamps stay internal (History only).

---

## Workstream B — plans and protocols carry everything

### B1. Duplicate copies page 2 (item 7)
`duplicatePlan` (lib/plans.ts) copies `plan_items` (all fields) but not `plan_guide`, so a
duplicated plan's Prepare page falls back to defaults. Change it to also copy the
`plan_guide` row (intro, next_consultation, lifestyle, dietary, supplement_text,
meds_text, notes) with `consultation_date = NULL`. If the source has no guide row, the
duplicate has none either (unchanged behaviour). One `INSERT … SELECT` right after the
item copy.

### B2. Protocols store both pages (item 8)
Schema (additive, via `ensureColumn`):
- `protocol_items`: add `note`, `duration`, `order_code`, `size` (TEXT, nullable).
- `protocols`: add `next_consultation`, `lifestyle`, `dietary`, `notes` (TEXT, nullable).

Page-2 sections a protocol carries: **next consultation, lifestyle, dietary, notes.**
Deliberately excluded because they are patient-specific: the intro (a personal greeting
that names the client), medications (auto-filled from the patient's own profile), and
the consultation date.

`savePlanAsProtocol(planId, …)`: copy every item field (preset, custom dosing, note,
duration, order code, size, position) and the four page-2 sections from the plan's saved
`plan_guide` (null where absent).

`applyProtocolToPlan(protocolId, planId)`:
- Items: add each product and set preset/custom dosing, note, duration, order code and
  size using the existing setters (`setItemDosing`, `setItemNote`, `setItemDuration`,
  `setItemOrderCode`, `setItemSize`).
- Page 2: load the plan's saved guide (or an empty one), and for each of the four
  sections apply `mergeSection(existing, incoming)`: empty existing → incoming; both
  non-empty → `existing + "\n\n" + incoming`; incoming empty → existing unchanged. Save
  with `savePlanGuide`. Never touches consultation date, intro or medications.
- Existing protocols (created before this change) have null page-2 fields and null item
  extras, so applying them behaves exactly as today.

Protocol builder (`/protocols/[id]`): add four textareas to edit the page-2 sections, and
show each item's duration / pack size / note / code read-only beside its dosing. Editing
those item extras inside the builder is out of scope (edit a plan and re-save it as a
protocol instead).

---

## Workstream C — managed lists

All three are new admin pages following the existing **Admin → Notes** pattern
(server-rendered list, add form, inline edit, delete), gated with `requireAdmin` like the
Notes page, and linked from the sidebar.

### C1. Dosing presets (item 1)
- Table `dosing_presets` gains `archived INTEGER NOT NULL DEFAULT 0`.
- Page `/admin/dosing`: list active presets (label + text), add, edit label/text, delete.
- **Delete = archive.** Plan items store the preset id and resolve its text at render time
  (`dosingTextFor`), so a hard delete would blank the dosing on draft plans that use it.
  Archived presets are hidden from every picker (plan builder, protocol builder) but still
  resolve for items that already reference them.
- Editing a preset's text updates the wording on draft plans that use it. Finalised plans
  are unaffected (their PDF and frozen data are already stored).

### C2. Discount codes per brand (item 3)
- New table `brand_codes (id, brand_id → brands, code TEXT NOT NULL, is_default INTEGER
  NOT NULL DEFAULT 0, UNIQUE(brand_id, code))`. At most one default per brand (enforced in
  the setter: setting a default clears the others for that brand).
- **Migration (idempotent):** for each brand with a non-empty `brands.promo_code` and no
  `brand_codes` rows, insert it as that brand's default. `brand_codes` then becomes the
  source of truth; `brands.promo_code` is no longer read.
- The brand's default code replaces `product.brand_promo_code` (lib/products.ts reads it
  from `brand_codes` where `is_default = 1`).
- Manage codes on the existing **Catalog → Brands** page: per brand, list codes, add a
  code, delete a code, mark one as default. Replaces the single promo-code field there.
- Plan item **Order code** becomes a dropdown (replacing the free-text box):
  - "Brand default (WN10)" — stored as `NULL` (follows the brand default; today's
    behaviour for items with no code),
  - each of the product brand's codes — stored as the code string,
  - "No code" — stored as `""` (explicitly print nothing).
  - If an item's stored code is no longer in the brand's list, it still appears as an
    option labelled "WN5 (no longer listed)" so saving the form never silently drops it.
- Resolution in `buildSupplementRows`: `orderCode === null` → brand default (or nothing if
  the brand has none); `""` → nothing; otherwise the stored code.
- Item codes are stored as text, not ids, so deleting a code never changes what an
  existing plan or snapshot prints.

### C3. Dietary protocols (item 9)
- New table `dietary_protocols (id, name TEXT NOT NULL, body TEXT NOT NULL, created_by,
  created_at)`.
- Page `/admin/dietary-protocols`: list, add (name + multi-line body), edit, delete (hard
  delete is fine — inserted text is copied into the plan, not referenced).
- Prepare page, Dietary section: a "Insert a dietary protocol…" dropdown above the
  textarea. Picking one appends its body to the Dietary text (blank → body; otherwise
  existing + blank line + body), mirroring the existing note-insert behaviour. The text
  stays fully editable.

---

## Workstream D — Word download (item 5)

- Add dependency `docx` (pure JS, works on Vercel serverless).
- New `lib/docx.ts` → `renderPlanDocx(data: GuidePdfData, templateId): Promise<Buffer>`,
  mirroring the PDF content and order:
  - **Header/footer:** Word's real header and footer contain the same transparent banner
    PNGs as the PDF. When the letterhead theme has a background colour, the banner sits
    in a single full-width table cell shaded with that colour. (Word keeps header/footer
    inside page margins, so the band is not edge-to-edge like the PDF — an accepted
    difference.)
  - **Body:** "Name of client" / "Date of consultation" (formatted per A2) in gold labels;
    intro and next consultation; sections Lifestyle & Other Recommendations, Dietary
    Recommendations, Supplement Plan, Medications / Hormones / Contraception, Notes — same
    gold uppercase headings, empty sections omitted.
  - **Supplement Plan** as a 3-column Word table (Supplement / Dosage / Where to buy) with
    brand · size, dose, duration, note, clickable "Buy at …" hyperlinks and the code.
  - **Font:** Merriweather throughout. Word only shows Merriweather where it is installed
    (it's a free Google font); otherwise Word substitutes. Lorna should install it once.
- Which letterhead: at finalise time, `frozen_json` becomes `{ ...pdfData,
  letterheadTemplate }` (an extra top-level key; the PDF data shape is unchanged) so Word
  matches the PDF that was made. Older snapshots without the key use the current clinic
  setting.
- Route `GET /api/snapshots/[id]/docx` (auth-gated like the PDF route; `?download=1` →
  attachment `supplement-plan-<id>.docx`), generated on demand from `frozen_json`. Not
  stored.
- Patient History: a "Download Word" button beside "Download PDF" on every snapshot.

---

## Error handling

- Unknown letterhead template → default theme (existing `getLetterheadTheme`).
- Snapshot without frozen data or missing → 404 (same as the PDF route); unauthenticated →
  401.
- Archived preset ids still resolve their text; a preset id that no longer exists at all
  resolves to the custom text (existing behaviour).
- Admin actions reject empty labels/codes/names server-side (no-op, like the Notes page).
- Duplicate code within a brand → ignored (UNIQUE + `INSERT OR IGNORE`).

## Testing

Each change is test-first (vitest, existing `test/` conventions):
- A: `formatDuration`, `formatConsultationDate` (ISO, non-ISO passthrough, empty), PDF
  renders with "See notes below".
- B: duplicate copies guide fields with null consultation date; save-as-protocol captures
  all item fields + four sections; apply merges per the rules (empty fill, append,
  untouched intro/meds/date); old protocols still apply.
- C: preset archive hides from picker but `dosingTextFor` still resolves; brand-code
  migration from `promo_code`; single default per brand; `buildSupplementRows` resolution
  for null / "" / code; dietary protocol CRUD.
- D: `renderPlanDocx` returns a valid .docx (zip signature) whose `word/document.xml`
  contains the client name, formatted date, section headings and a table row per
  supplement; header part contains the shading colour for a coloured theme; route returns
  401 without a session.
- Every workstream: full suite green, then verified on the live app before it's called
  done.

## Out of scope

- Emailing Word files (email keeps sending the PDF).
- Editing item extras (duration/size/note/code) inside the protocol builder.
- Edge-to-edge background band in Word.
- Changing what's stored for already-finalised plans.

## Rollout

Ship A → B → C → D as separate commits/deploys, each verified on prod. Migrations are
additive and run automatically at build (`tsx scripts/migrate.ts && next build`).
