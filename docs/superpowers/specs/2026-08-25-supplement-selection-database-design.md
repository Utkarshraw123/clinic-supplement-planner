# Supplement Selection Database — Design Spec

**Date:** 2026-08-25
**Status:** Approved design, ready for implementation planning
**Working name:** Supplement Selection Database (Lorna clinic tool) — renameable

---

## 1. Purpose

An internal, private clinical tool that lets a nutrition clinic's practitioners build,
edit, and export client supplement plans without leaving the app. It replaces the current
workflow of assembling lists in external tools (Google Sheets), manual copy-paste, and
searching the web mid-appointment.

Three goals:

- **Efficiency** — select supplements from a central catalog; no external lists.
- **Flexibility** — edit and update a client's plan during or after each appointment as
  their needs evolve.
- **Export & branding** — export a finalised plan to a clinic-branded PDF, archived to the
  client's file and emailed to the client.

## 2. Scope

### In scope (v1)

- Multi-user email/password auth with two roles (Admin, Team), 3–4 staff accounts.
- Product catalog organised by brand, with structured tags, multiple supplier links, and
  alternative-format links.
- Partial-list importer + fast product editor + paste-a-URL enrichment assist.
- Patient records (Name + DOB identifiers; allergies, health goals, diet preferences,
  meds/conditions/life-stage as clinical inputs).
- Plan builder with preset + custom dosing, per-item supplier links, and alternative formats.
- **Rules-based** deterministic allergy/contraindication flagging (hard block + soft warning).
- **Rules-based** two-stage recommendation engine (hard filter → soft rank), fully explainable.
- Clinic-branded PDF export, archived as a per-plan snapshot and emailed to the client.
- Audit trail for finalise/send and profile changes.

### Out of scope (v1, designed-for-later)

- AI/LLM-generated supplement plans (deliberately avoided — clinical safety, auditability).
- Client-facing web access or portal (clients only ever receive the exported PDF).
- Storing standing client contact details beyond Name + DOB (email captured at send-time).
- Inventory/stock, pricing, or ordering integrations.

## 3. Architecture

**Stack**

- Next.js 14 (App Router) deployed to Vercel (serverless).
- Turso (libSQL) via `@libsql/client`, raw parameterised SQL, no ORM.
- Email/password auth: bcrypt-hashed passwords, HTTP-only session cookies, role-based.
- Server-side PDF generation.
- Transactional email (Resend or equivalent) for sending plans; runs in mock mode
  (logs, no send) until a key is configured.

**Frontend approach**

A polished, cohesive design system — clinical, calm, confidence-inspiring, not a generic
CRUD admin. Built with the UI UX Pro Max skill for system rigor and the 21st.dev MCP to
generate/refine key components (search, product cards, tables, forms, the plan builder).
Design quality is a first-class requirement with its own plan phase, not a finishing pass.

**Rationale for stack:** matches the user's existing projects (Vercel + Turso), so tooling,
deploy flow, and the mock-mode-without-keys pattern are already familiar and proven.

## 4. Data model

Controlled taxonomies are the matching backbone — all clinical tags are drawn from curated
term lists, never free text, so `mushroom` (allergen) reliably matches `mushroom` (ingredient).

| Entity | Fields | Notes |
|---|---|---|
| **User** | id, email, password_hash, role (`admin`/`team`), name, created_at | 3–4 accounts. Admin manages users, taxonomies, branding. |
| **Brand** | id, name, logo_url, website | The umbrella grouping (all Wild Nutrition together, Bare Biology together). |
| **Product** | id, brand_id→, name, package_size, form (capsule/liquid/powder/…), status (active/archived) | Catalog item. Search returns products across all brands. |
| **ProductTag** | product_id→, taxonomy_term_id→, tag_type (ingredient/allergen/concern/diet/caution) | Many per product; the matching data. |
| **SupplierLink** | id, product_id→, label, url | Many per product (brand site, Natural Dispensary, …). |
| **ProductAlternative** | product_id→, alternative_product_id→ | "OR this format" pairing (capsule ⇄ liquid). Symmetric. |
| **TaxonomyTerm** | id, type (allergen/ingredient/concern/diet/caution), label, created_by | Curated pick-lists; staff can add terms, which become reusable. |
| **Patient** | id, name, dob, created_at, created_by | Identifiers = Name + DOB only. |
| **PatientAttribute** | patient_id→, taxonomy_term_id→, attr_type (allergy/goal/diet/med_condition) | Clinical inputs used for flagging + suggestions. |
| **Plan** | id, patient_id→, status (draft/finalised), author_id→, created_at, updated_at | Evolves in place while draft. |
| **PlanItem** | id, plan_id→, product_id→, dosing_preset_id?, dosing_custom_text?, chosen_alternative_id?, position | One row per recommended supplement. |
| **PlanSnapshot** | id, plan_id→, frozen_json, pdf_url, sent_to_email?, sent_at?, sent_by?, created_at | Immutable archive of a finalised/sent plan; history over time. |
| **DosingPreset** | id, label, text | Standard instruction dropdown ("Take 2 capsules with food"). |
| **AuditEvent** | id, actor_id→, action, entity, entity_id, detail, created_at | Finalise/send + profile changes. |
| **ClinicSettings** | logo_url, clinic_name, address, contact, email_from | Single row; drives PDF branding. |

**Two relationships worth restating:**

- A **Plan** evolves in place (persistent draft). Each finalise/send freezes a **PlanSnapshot**
  (frozen content + generated PDF) — this is both "saved in the client's file" and the version
  history as needs evolve.
- **SupplierLink** and **ProductAlternative** are separate tables (not product columns), so a
  product carries any number of suppliers and alternatives without schema churn.

## 5. The engine

Deterministic, set-based, explainable. No AI in the clinical path.

**Flagging (per product, against the current patient profile):**

- `product.allergens ∪ product.ingredients` ∩ `patient.allergies` ≠ ∅ → **HARD BLOCK**
  (red; cannot be added to a finalised plan / PDF).
- `product.cautions` ∩ `patient.meds_conditions` ≠ ∅ → **SOFT WARNING** (amber; practitioner
  may knowingly override).
- Diet mismatch (e.g. patient vegan, product not vegan-suitable) → hard filter for suggestions,
  soft warning if manually added.

**Suggestions — two stage:**

1. **Filter** — remove every product that hard-blocks or violates a hard diet preference.
   Unsafe products can never be suggested.
2. **Rank** — score survivors by count of `product.concerns ∩ patient.goals`, then diet/format
   fit. Each suggestion carries its reason string ("targets energy + gut health · vegan ·
   allergy-safe").

**Finalise-time re-check:** the PDF generator re-runs flagging against the *current* patient
profile for every item, so a plan can never be sent with a known allergen conflict even if the
profile changed after an item was added. A blocked item stops finalisation with a clear message.

## 6. Screens

| Screen | Purpose | Role |
|---|---|---|
| Login | Email/password, role-aware | all |
| Patients list | Search/browse patients | all |
| Patient profile | Name/DOB + allergies, goals, diet, meds/conditions | all |
| Plan builder | Assemble/edit plan; flags, suggestions, dosing, suppliers, alternatives | all |
| Patient file / history | Past finalised plans (snapshots + PDFs), send log | all |
| Catalog | Brand → products; browse, add, archive | all |
| Product editor | Structured fields, tags, supplier links, alternatives, URL-enrichment assist | all |
| Import | Seed catalog from a partial spreadsheet | all |
| Taxonomies | Manage allergen/ingredient/concern/diet/caution term lists | admin |
| Users | Add/remove staff, set roles | admin |
| Settings | Clinic branding for the PDF (logo, name, address, contact, from-email) | admin |

## 7. PDF output

Clinic-branded document: letterhead (logo + clinic name/address/contact from Settings),
"Supplement plan" title + prepared date, "Prepared for {Name} · DOB", then each supplement
with brand + size, plain-language dosing, alternative-format note where set, and all supplier
links. Footer disclaimer (personal use, not a substitute for medical advice). Generated
server-side; stored on the snapshot; attached to the client email.

## 8. Security & privacy

- Bcrypt-hashed passwords; HTTP-only, secure session cookies; CSRF protection on mutations.
- Roles: **Admin** (everything + users, taxonomies, branding) and **Team** (patients, plans,
  catalog). All routes require auth; admin routes require admin role.
- **Data minimisation:** stored patient identifiers = Name + DOB only. Client email is captured
  at send-time for delivery and logged on the snapshot's send record, not retained as a standing
  patient field. (Overridable later if the clinic prefers to store it.)
- Email sends and profile changes are written to the audit trail.
- Runs fully in mock mode without an email key (send is logged, not dispatched).

## 9. Non-functional

- Deterministic, auditable clinical logic — no LLM in flagging or recommendations.
- Mock-mode-without-keys so the whole app is exercisable before credentials exist.
- Test coverage for the engine (flagging + two-stage ranking), auth/roles, and PDF re-check.

## 10. Open items to confirm during build

- Final product name (working name used for now).
- Clinic branding assets (logo, name, address, contact, from-email) — needed for real PDFs.
- Email provider choice + domain verification (Resend assumed).
- Shape of the partial spreadsheet to import (columns available).

## 11. Explicitly deferred (YAGNI for v1)

- AI-generated plans.
- Client portal / client login.
- Inventory, pricing, ordering.
- Storing standing client contact details.
