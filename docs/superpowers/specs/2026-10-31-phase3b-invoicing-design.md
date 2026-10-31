# Phase 3b — Client-facing Invoicing — Design

**Date:** 2026-10-31
**Status:** Approved scope; ready to plan
**Author:** Utkarsh + Claude (Opus 4.8)

## Context

Part of the supplement super-app (one app replacing Practice Better / Semble / Heidi / Timely / QuickBooks for nutrition & functional-medicine practitioners). Phases 0–2 (multi-tenant GDPR SaaS foundation, client CRM, booking/portal) and Phase 3a (AI scribe) are done on `main`. This is **3b**: the practitioner bills *their patient* for consultations, packages, plans, etc.

Distinct from the **Phase 0c** SaaS billing (Stripe subscription for the practitioner's own seat, control-plane). 3b is a *different money flow* — practitioner → patient — and lives entirely in the **tenant DB**.

Everything is **mock-safe**: with no keys the full flow works in dev at $0; real services (per-tenant Stripe test keys, Resend) only cost money once keys are added.

## Decisions (from brainstorming)

- **Payment model:** the app generates + tracks invoices and, when a per-tenant Stripe key is present, can create a **Stripe Payment Link** so the patient pays by card. A manual **"Mark paid"** is always available (bank transfer / offline). Each practitioner uses their **own** Stripe keys (per tenant) — not Stripe Connect, not the platform's key.
- **Line-item sources:** a single generic line-item model with convenience prefills — free-form rows (base), **prefill from a booked appointment** (pulls the appointment type + its price), **bill for a finalised supplement plan**, and a **named package** as a priced line. Package session-usage tracking is a non-goal.
- **Delivery:** **email the branded PDF + pay link** (Resend, mock-safe) and **download/print** the PDF. No patient-portal invoice view.
- **Tax:** an **optional per-tenant VAT rate + VAT number** in clinic settings. Blank/0 → no tax line. Applied to the subtotal. (Not per-line tax.)
- **Currency:** per-tenant setting, default **EUR** (clinic is Dublin-based).

## Load-bearing facts about the existing code (reuse these)

- **`clinic_settings`** is a per-tenant **singleton** (row `id = 1`) in the tenant DB: `clinic_name, logo_url, address, contact, email_from, letterhead_template`. `lib/settings.ts` reads/writes it. Extend it with the invoicing columns.
- **`appointment_types`** already has a `price TEXT` column (free text, e.g. `"€75"` / `"75"`), and `appointments` ties a booked slot to a patient + type. "Prefill from appointment" parses the numeric part of `price` best-effort (0 if unparseable; practitioner edits).
- **PDF** uses `@react-pdf/renderer` — `lib/pdf.tsx` (the prescription/plan PDF), `lib/pdf-themes.ts` (colourways keyed off `clinic_settings.letterhead_template`), `lib/pdf-fonts.ts` (base64 Merriweather, no runtime fetch). Mirror this for the invoice PDF.
- **Email** uses Resend and is mock-safe (no `RESEND_API_KEY` → logged mock), as in the plan-delivery flow. Mirror it.
- **Stripe SDK** already wired in `lib/billing/stripe.ts` (control-plane subscription checkout). 3b adds a *separate* per-tenant helper; it does **not** reuse the control-plane key.
- **GDPR:** `deletePatient` (`lib/patients.ts`) explicitly deletes every child table (PII-free audited); `lib/gdpr-export.ts` aggregates a patient's data. Both must learn about invoices.
- **Audit:** `recordAudit({ actorId, action, entity, entityId, detail })` — `detail` must stay PII-free.
- **Migrations:** `lib/schema.sql` creates tables with `CREATE TABLE IF NOT EXISTS`; `scripts/migrate.ts` adds later columns via `ensureColumn(table, col, type)`. Run `npm run migrate:all` after schema changes. **Never put `;` in a SQL comment** (the migrator splits on `;`). libsql enforces FKs only where `PRAGMA foreign_keys` is on; the erasure cascade is done explicitly in code regardless.

## Data model (tenant DB)

### `invoices`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `patient_id` | INTEGER REFERENCES patients(id) ON DELETE CASCADE | |
| `number` | TEXT | assigned at finalise, e.g. `INV-0001`; null while draft |
| `status` | TEXT NOT NULL DEFAULT `'draft'` CHECK(`draft|sent|paid|void`) | `sent` = **finalised/issued** (set by `finaliseInvoice`, whether or not it was emailed yet) |
| `issue_date` | TEXT | set at finalise (YYYY-MM-DD) |
| `due_date` | TEXT | optional |
| `currency` | TEXT NOT NULL DEFAULT `'EUR'` | snapshot from settings at finalise |
| `subtotal_cents` | INTEGER NOT NULL DEFAULT 0 | |
| `tax_rate` | REAL | snapshot of VAT % at finalise (null = none) |
| `tax_cents` | INTEGER NOT NULL DEFAULT 0 | |
| `total_cents` | INTEGER NOT NULL DEFAULT 0 | |
| `notes` | TEXT | shown on the invoice |
| `payment_link_url` | TEXT | null until a pay link is created |
| `paid_at` | TEXT | null until paid |
| `paid_method` | TEXT | `stripe|manual`, null until paid |
| `created_by` | INTEGER REFERENCES users(id) | tenant-local user id |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |
| `updated_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

### `invoice_items`
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `invoice_id` | INTEGER REFERENCES invoices(id) ON DELETE CASCADE | |
| `description` | TEXT NOT NULL | |
| `quantity` | REAL NOT NULL DEFAULT 1 | |
| `unit_price_cents` | INTEGER NOT NULL DEFAULT 0 | |
| `amount_cents` | INTEGER NOT NULL DEFAULT 0 | `round(quantity * unit_price_cents)` |
| `source` | TEXT | `appointment|plan|package|free` (cosmetic/traceability) |
| `appointment_id` | INTEGER | null unless sourced from an appointment |
| `plan_id` | INTEGER | null unless sourced from a plan |
| `sort` | INTEGER NOT NULL DEFAULT 0 | row order |

### `clinic_settings` new columns (via `ensureColumn`)
`currency TEXT` (default `'EUR'`), `vat_rate REAL` (null), `vat_number TEXT` (null), `invoice_prefix TEXT` (default `'INV-'`), `invoice_next_seq INTEGER` (default 1), `stripe_secret_key TEXT` (null).

**Money:** integer cents everywhere; no floats in money math. `quantity` is REAL (allows e.g. 0.5 h). `computeTotals` rounds each line and the tax with `Math.round`.

## Library modules (one clear purpose each)

- **`lib/invoices.ts`** — the engine.
  - `computeTotals(items: {quantity; unitPriceCents}[], taxRate: number|null): { subtotalCents; taxCents; totalCents }` — **pure**, exported, unit-tested (line = `round(q*unit)`, subtotal = Σ, tax = `round(subtotal*rate/100)`, total = subtotal+tax; null/0 rate → tax 0).
  - `createInvoice(patientId, { items, dueDate?, notes?, createdBy? }) → id` — status `draft`, no number yet; persists items; stores computed subtotal/total (tax 0 until finalise). Audits `invoice_created`.
  - `getInvoice(id) → { invoice, items } | null`; `listInvoicesForPatient(patientId)`; `listInvoices({ status? })`.
  - `updateDraft(id, { items, dueDate?, notes? })` — draft only; replaces items + recomputes. Throws if not draft.
  - `finaliseInvoice(id) → number` — draft→`sent`: assigns the next number atomically from `clinic_settings` (`invoice_prefix` + zero-padded `invoice_next_seq`, then increment), snapshots `currency` + `vat_rate`, sets `issue_date = today`, recomputes with tax. Audits `invoice_sent`. Throws if not draft.
  - `markPaid(id, method: 'stripe'|'manual', actorId?)` — sets `paid`, `paid_at`, `paid_method`. Audits `invoice_paid`.
  - `voidInvoice(id, actorId?)` — sets `void`. Audits `invoice_voided`.
  - `setPaymentLink(id, url)` — stores `payment_link_url`.
- **`lib/invoice-numbering`** — the atomic next-number read-increment on `clinic_settings` (kept inside `lib/invoices.ts` as a private helper; broken out only if reused).
- **`lib/billing/payment-links.ts`** — `createPaymentLink({ invoice, items, currency, key? }) → { url; mocked }`. With a key: Stripe SDK Payment Link (inline `price_data` for the total, or line items). **Mock-safe:** no key → deterministic mock URL (e.g. `https://pay.mock/invoice/<number>`) + `mocked:true`. Key is passed in (from settings), never read from `process.env` here.
- **`lib/invoice-pdf.tsx`** — `InvoicePdf` react-pdf component + `renderInvoicePdf(invoice, items, settings) → Buffer`. Reuses `pdf-themes` + `pdf-fonts`. Shows clinic letterhead/logo, invoice number/dates, patient, line-item table, subtotal/VAT(+number)/total, notes, and (if present) the pay link.
- **`lib/invoice-email.ts`** — `emailInvoice({ invoice, patient, pdf, payUrl? }) → { sent; mocked }` via Resend; mock-safe (no key → logged mock). Audits `invoice_emailed`.

## Routes / server actions

- **`app/invoices/actions.ts`** — `"use server"`: `createInvoiceAction`, `saveDraftAction`, `finaliseAction`, `markPaidAction`, `voidAction`, `emailInvoiceAction`, `createPayLinkAction`. All behind the practitioner session (middleware already gates non-public routes). `createPayLinkAction` reads `stripe_secret_key` from settings, calls `createPaymentLink`, stores the URL.
- **`app/api/invoices/[id]/pdf/route.ts`** — authed (`requireUser`) → `renderInvoicePdf` → `application/pdf` download.
- **Non-goal:** a Stripe webhook that auto-marks an invoice paid. Per-tenant webhook signing secrets add real complexity; manual "Mark paid" is the reliable MVP path. Deferred as a later slice.

## UI (practitioner only)

- **`app/invoices/page.tsx`** — list all invoices (number, patient, issue date, total with currency, status badge), filter by status, "New invoice" button.
- **`app/invoices/new/page.tsx`** and **`app/invoices/[id]/page.tsx`** (edit draft) — patient picker (or `?patientId=` prefill); line-item editor: add a free row; **"Add from appointment"** (pick one of the patient's booked appointments → prefills description from the type name + parses `price`); **"Add from plan"** (pick a finalised plan → a line like "Supplement plan & protocol"); **"Add package"** (named priced row); live subtotal / VAT / total; due date; notes. Buttons by state: draft → Save draft, Finalise; sent/paid → Download PDF, Email to patient, Create pay link, Mark paid, Void (void allowed on sent).
- **`app/patients/[id]/page.tsx`** — a new **"Invoices" card** (mirrors the Notes/Intake cards): this patient's invoices with status + totals, and "New invoice" prefilling the patient.
- **`app/admin/settings`** — add fields: currency, VAT rate, VAT number, invoice prefix, Stripe secret key.

## GDPR / security / audit

- Extend `deletePatient`'s erasure cascade to delete `invoice_items` (via their invoices) then `invoices` for the patient (explicit deletes, matching the existing pattern; FK cascade is belt-and-braces).
- Extend `lib/gdpr-export.ts` to include the patient's invoices (metadata + items + totals + status). **Never** include `stripe_secret_key` or any secret.
- Audit every state change with PII-free `detail` (e.g. `"invoice 12 sent"`), never amounts tied to a named person beyond the id.
- `stripe_secret_key` in `clinic_settings` is sensitive: **dev uses Stripe test keys only**; encryption-at-rest is a documented **go-live follow-up**; the key is never returned to the client, exported, or logged.

## Mock-safety (dev $0)

No Stripe key → `createPaymentLink` returns a mock URL (`mocked:true`); status still advances via manual Mark paid. No Resend key → email is a logged mock. No AI involved. The whole lifecycle (create → finalise → PDF → email → pay link → mark paid) is exercisable and testable with **no keys**.

## Testing (TDD, per sub-plan)

- `computeTotals` pure unit tests: single/multi line, `quantity` fractional, rounding, VAT null/0/20 %.
- Invoice lifecycle: create draft (no number) → `updateDraft` → `finaliseInvoice` assigns a sequential number + snapshots tax/currency + sets issue_date → `markPaid` → audit trail contains `invoice_created/sent/paid`; `voidInvoice`; `listInvoicesForPatient`.
- Numbering: two finalised invoices get consecutive numbers; `invoice_next_seq` persists in settings; prefix respected.
- `createPaymentLink` mock test (no key → mock URL, `mocked:true`).
- GDPR: `deletePatient` removes the patient's invoices + items; `gdpr-export` includes them and omits secrets.
- Browser smoke (mock mode, after `npm run migrate:all`): from a patient, New invoice → add an appointment line + a plan line + a free line → VAT shows per settings → Finalise (number assigned) → Download PDF (branded) → Email (mock) → Create pay link (mock URL) → Mark paid → status badge flips; confirm no server errors.

## Decomposition into implementation plans

- **3b-1 — invoice engine:** schema (`invoices`, `invoice_items`) + `clinic_settings` columns + `lib/invoices.ts` (incl. pure `computeTotals` + numbering) + tests. `npm run migrate:all`.
- **3b-2 — PDF + email:** `lib/invoice-pdf.tsx` + `app/api/invoices/[id]/pdf/route.ts` + `lib/invoice-email.ts` (mock-safe) + tests.
- **3b-3 — payments:** `lib/billing/payment-links.ts` (mock-safe) + `markPaid`/`void` actions + Stripe key setting + tests.
- **3b-4 — UI + GDPR wiring:** invoices list/editor, patient-page Invoices card, settings fields; extend `deletePatient` + `gdpr-export`; browser smoke.

## Explicit non-goals (YAGNI)

Stripe Connect / platform fees; automatic webhook reconciliation; multi-currency per invoice; per-line tax; credit notes / refunds; recurring invoices; package session-usage tracking; a patient-portal invoice view. Each is a candidate later slice, not part of 3b.
