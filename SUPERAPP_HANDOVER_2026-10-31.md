# Supplement Super-App — Full Context Handover (2026-10-31)

This is a complete handover of the commercial super-app project built on top of the
Lorna-clinic supplement planner. Read this top to bottom to resume with zero prior context.

**Repo:** `/Users/utkarshrawat/Wild Dash/supplement-selection-db` (its own git repo — keep SEPARATE from practitioner-portal and other Wild Dash projects).
**Stack:** Next.js 14 (app router, server actions) · Turso/libSQL (`@libsql/client`) · `jose` JWT · `bcryptjs` · `vitest` · `tsx` · Resend (email, mock-safe) · Stripe SDK · `@anthropic-ai/sdk` + Deepgram (AI scribe, mock-safe).
**Dev:** `npm run dev` (port 3200) · tests `npm test` · typecheck `npx tsc --noEmit` · migrations `npm run migrate:all`.

---

## 1. The vision

Turn the single-clinic supplement planner into a **commercial, multi-tenant SaaS "super-app"** for nutrition / functional-medicine practitioners — one app that replaces the 4–5 tools they currently stitch together.

- **Wedge / differentiator:** the existing **supplement protocol engine** (upload library, editable set-protocols, deep personalization, branded PDF). No competitor does this natively (they all route supplements through Fullscript).
- **Buyer:** solo & small-clinic SaaS, self-signup, monthly per-seat.
- **Launch:** ONE complete offering (user does NOT want partial public releases) — but BUILT in dependency order. "It has to be the best." Timeline flexible (couple of months).
- **Cost stance:** user wants **no new paid resources while building** — everything is built **mock-safe** so dev/test costs $0; real external services (Turso scale, Stripe, AI) are wired but only cost money once keys are added.

### Competitor analysis (reviews mined 2026-10-30)
- **Practice Better** (intake/consent/PM): rising price, ~2-week support waits, clunky UI, meal-planning is a bolt-on (That Clean Life). 
- **Semble** (NHS-grade PM): slow, painful migration / data-loss reports.
- **Heidi** (AI scribe): **fabricates clinical details**, dropped transcripts, static templates, ~3.3–3.7★.
- **Timely** (booking): pricey for teams, weak mobile.
- **QuickBooks** (accounting): overkill for a solo practitioner → **don't rebuild it, export to it later**.
- **AI scribe positioning decision:** ours is "AI note-drafting **you approve**" (human-in-the-loop sign-off), NOT a medical-grade autopilot — directly answers Heidi's fabrication/trust problem.

---

## 2. Current status (2026-10-31)

**Phases 0, 1, 2 are DONE and MERGED to `main`. Phase 3 is in progress on `main`.**

- Branch `multi-tenant-foundation` (Phases 0+1+2) was **merged into `main`** (merge commit `67f296b`, `--no-ff`). That branch still exists (not deleted).
- **Phase 3 work is committed directly on `main`** (no feature branch) — HEAD `556997d` area.
- **`main` is NOT pushed** — it is ~63 commits ahead of `origin/main`, all local.
- **204 tests passing**, `tsc` clean.
- **IMPORTANT — do not push `main` yet:** `main` auto-deploys to Vercel (clinic-supplement-planner.vercel.app). Pushing would deploy the multi-tenant/billing/portal/scribe code to PROD before the env vars are set, breaking signup/billing/scribe paths. Hold the push until go-live config is decided (see §7).

### Phase scorecard
| Phase | Scope | Status |
|---|---|---|
| **0** | Multi-tenant GDPR SaaS foundation | ✅ merged |
| **1** | Client CRM: contact, consent, consultation notes, intake | ✅ merged |
| **2** | Appointments, availability, public self-booking, reminders, client portal | ✅ merged |
| **3a-1** | AI scribe: mock-safe AI providers (transcribe + draft) | ✅ on main |
| **3a-2/3** | AI scribe: consent gate + endpoint + recording UI | 📋 PLANNED, NOT BUILT (next) |
| **3b** | Client-facing invoicing | ⬜ not started (needs own spec) |
| **3c** | Meal plans | ⬜ not started (needs own spec) |

---

## 3. Architecture — the load-bearing facts

### Multi-tenancy (Phase 0)
- **Database-per-tenant on Turso/libSQL.** Each clinic = its own DB. A shared **control-plane DB** (`lib/control-schema.sql`: `tenants`, `users`, `memberships`, `subscriptions`, `provisioning_jobs`) holds cross-clinic data. Clinical/patient data lives only in tenant DBs.
- **`lib/db.ts` is the core.** `getControlDb()`, `getTenantDb(tenantId)`, and the big refactor: `query()`/`execute()` resolve the **active tenant client** via `AsyncLocalStorage` → signed-in session's tenant → **env-default DB fallback**. The env fallback is why all existing tests + seed scripts kept working untouched. `runWithDb(client, fn)` sets the active client (used by tests, scripts, and every public tenant-from-URL page). `getActiveDb()` is the async accessor (the two `.batch()` sites in plans.ts/patients.ts use it).
- **Public, tenant-from-URL surfaces** (no practitioner session) resolve the tenant from the URL slug and wrap ALL DB work in `runWithDb(await getTenantDb(slug))`: `/book/[tenant]` (self-booking) and `/portal/[tenant]` (client portal). NEVER use session-based tenant resolution there.

### Auth (Phases 0 + 2d)
- **Practitioner auth:** control-plane login. Session = `jose` JWT in `sess` cookie, payload `{ userId, tenantId, role }`. `role` stays the union `"admin"|"team"` (derived from membership role owner/admin→admin, practitioner→team) so all pre-existing `role==="admin"` checks were untouched. `middleware.ts` gates non-public routes.
- **Identity bridge (0b):** `memberships.tenant_user_id` maps each control-plane login to its **tenant-local** `users.id`. `session.userId` is the **tenant-local** id (so `created_by`/`author_id`/`actor_id` attribute correctly). `resolveLogin` returns it.
- **Client portal auth (2d):** passwordless **magic link** — single-use, sha256-hashed, 30-min tokens (`portal_login_tokens` in tenant DB). Separate `psess` cookie (JWT `{tenantId, patientId, kind:"portal"}`), scoped to `/portal/<tenant>` path. `lib/auth/portal-session.ts` + `lib/auth/portal-current.ts` (`requirePortalPatient`).
- **`middleware.ts` PUBLIC list:** `/login, /api/login, /signup, /api/signup, /api/billing/webhook, /book, /api/cron, /portal`.

### Billing (Phase 0c)
- Control-plane `subscriptions` (one per tenant). `lib/billing/subscriptions.ts` (upsert/get/startTrial(14d)/`subscriptionAccess` pure gate: allows active|comp|past_due + in-date trialing; blocks missing/expired-trial/canceled). `provisionTenant` starts a trial. `lib/billing/stripe.ts` (checkout + portal, mock via Stripe SDK). `lib/billing/webhook.ts` `applyStripeEvent` + `/api/billing/webhook` (signature-verified). `lib/billing/gate.ts` `requireActiveSubscription` → redirect `/billing`; wired into `app/dashboard/page.tsx` ONLY (follow-up: route-group layout to gate all routes). Dev tenant gets a `comp` subscription via bootstrap.

### Provisioning (Phase 0b)
- `lib/tenancy/turso.ts` (createTursoDatabase/delete — Turso Platform API). `lib/tenancy/provision.ts` `provisionTenant` (create DB → migrate → seed starter → owner in tenant+control → membership → trial, tracked in `provisioning_jobs`). `createDb` is injectable (tests use local files). `lib/tenancy/create-db.ts` `resolveCreateDb` (real Turso if `TURSO_PLATFORM_TOKEN`+`TURSO_ORG` set, else local file DB — so DEV signup works with NO token). `lib/tenancy/signup.ts` `signupClinic` + slug.
- **Migration runner:** `scripts/migrate-tenants.ts` `runAllTenantMigrations()` = control migrations + `runMigrations()` against every tenant DB via `runWithDb`. `npm run migrate:all`. (`scripts/migrate.ts` = schema.sql + ensureColumn tweaks; `scripts/migrate-control.ts` = control schema.)

### GDPR (Phases 0e + threaded through)
- EU residency (Turso Dublin region, `vercel.json` `dub1`). Per-tenant audit (`lib/audit.ts`, `audit_events`), versioned append-only consent (`patient_consents`, `lib/consent.ts`), per-patient export (`lib/gdpr-export.ts` — includes patient+contact, attributes, consents, **notes**, **intake**, **appointments**, plans/snapshots metadata (NO pdf_base64), audit; `/api/gdpr/patient/[id]/export`), audited erasure (`deletePatient` is PII-free-audited + explicitly deletes all child tables).

### CRM (Phase 1)
- `patients` gained `email/phone/address1/address2/city/postcode` (1a). Consent panel on patient page (`consent-config.ts` holds `CONSENT_PURPOSES` — must be a SEPARATE non-"use server" file; a "use server" module may only export async fns). Consultation notes (1b): `consultation_notes` (dated, title/body + SOAP), `lib/consultation-notes.ts`, timeline + new/edit pages under `app/patients/[id]/notes/`. Intake (1c): `patient_intake` (one upserted row), `lib/intake.ts`, summary + edit page; patient-FILLED intake is in the portal (2d).

### Booking (Phase 2)
- Appointment types + `appointments` (`lib/appointments.ts`: types CRUD, createAppointment computes ends_at from duration, listUpcoming/forPatient, setStatus, listDueReminders, markReminderSent). Admin `/admin/appointment-types`, `/admin/availability`. `/appointments` (book + upcoming). Availability + pure `computeSlots` + `getOpenSlots` (`lib/availability.ts`). Public `/book/[tenant]` self-booking (reuse-or-create patient by email). Reminders: `lib/reminders.ts` (per-tenant + cross-tenant runner) + `/api/cron/reminders` (secret-protected, `vercel.json` hourly cron).

### AI scribe (Phase 3a-1, DONE)
- `lib/ai/scribe.ts` `draftNoteFromTranscript(transcript)` → Claude `claude-sonnet-5-5` drafts SOAP JSON; **mock-safe** (no `ANTHROPIC_API_KEY` → deterministic mock `{title,subjective,objective,assessment,plan,mocked:true}`). NOTE: installed `@anthropic-ai/sdk@0.69.0` typings don't support `output_config`/`effort` — it was removed from the call (just `model`+`max_tokens`+`system`+`messages`).
- `lib/ai/transcribe.ts` `transcribeAudio(audio, contentType)` → Deepgram REST (`nova-2`); **mock-safe** (no `DEEPGRAM_API_KEY` → deterministic mock transcript). Verify Deepgram response path against docs when key in hand.

---

## 4. EXACTLY where we are in Phase 3 (resume point)

**Phase 3a = AI consultation scribe.** Decided: record in browser → server transcription (Deepgram) → Claude drafts SOAP → practitioner reviews/edits/signs off → saved as a `consultation_note`. Model `claude-sonnet-5-5` (user-approved for cost). GDPR: explicit recording consent, **audio transcribed then discarded (never stored)**, only the approved note saved, human-in-the-loop.

- **3a-1 (DONE, on main):** the two mock-safe AI providers above + their tests. 204 tests green.
- **3a-2/3 (NEXT — plan written, NOT built):** plan at `docs/superpowers/plans/2026-10-31-phase3a-2-scribe-endpoint-and-ui.md`. Three tasks:
  1. Add `consultation_recording` consent purpose to `app/patients/[id]/consent-config.ts`; create `lib/scribe-flow.ts` `scribeConsultation({patientId,audio,contentType?,actorId?})` → enforce recording consent (throw `no_recording_consent`), `transcribeAudio`→`draftNoteFromTranscript`→`createNote(...)` with the draft, audit `scribe_used`, return `{noteId,mocked}`; audio never persisted. Test `test/scribe-flow.test.ts`.
  2. `app/api/scribe/route.ts` POST (practitioner-authed, multipart `audio`+`patientId`) → `scribeConsultation` → `{noteId,mocked}` (403 on `no_recording_consent`).
  3. `components/ScribeRecorder.tsx` (client, MediaRecorder) on the patient page, consent-gated → POST `/api/scribe` → redirect to `/patients/[id]/notes/[noteId]` (existing editor) for review/sign-off.
  **The plan has full copy-paste code for all three.** Execute it with TDD, `npm run migrate:all`, then browser-smoke in mock mode (grant consent → Start AI scribe → record → lands in note editor with mock SOAP draft → edit+save).

- **After 3a:** Phase 3b (client-facing invoicing — practitioner bills patient; invoice per appointment/package, PDF, Stripe payment link, mark-paid; free Stripe test keys; needs own spec) and 3c (meal plans — Nutrium-style; no external deps; biggest build; needs own spec).

---

## 5. How to run / develop

```bash
cd "/Users/utkarshrawat/Wild Dash/supplement-selection-db"
npm test                 # 204 tests, vitest (fileParallelism:false; shares file:test.db — see gotchas)
npx tsc --noEmit         # typecheck
rm -f control.db && npm run bootstrap:dev   # set up control-plane + adopt local.db as tenant "lorna-dev", owner lorna@clinic.test / lorna123, comp subscription
npm run migrate:all      # migrate control + all tenant DBs (run after any schema.sql change)
npm run dev              # port 3200
```
- Dev DBs are local files (gitignored `*.db`): `control.db` (control-plane), `local.db` (tenant "lorna-dev"), `tenant-test-clinic.db` (tenant "test-clinic", created by the 0d signup smoke; has patient "Sarah Connor" sarah@example.test, appointment type "Initial consultation 60m", availability Tue 09–12, patient "Jordan Public").
- Practitioner dev login: `lorna@clinic.test` / `lorna123` (tenant lorna-dev, has the full catalogue + ~29 patients). test-clinic owner: `drtest@testclinic.test` / `test-pass-123`.
- Public pages (no login): `/book/<tenant>` and `/portal/<tenant>` (e.g. `/book/test-clinic`, `/portal/test-clinic`).

---

## 6. GOTCHAS learned (don't re-discover these)
1. **`;` inside a SQL comment** in `lib/schema.sql`/`control-schema.sql` breaks the migrator (it splits on `;`) → "SQLITE_UNKNOWN: not an error". Never put `;` in SQL comments.
2. **After editing `schema.sql`, run `npm run migrate:all`** to update local.db + all tenant DBs (not just test.db).
3. **libsql ENFORCES foreign keys.** Tests that reset the control-plane must DROP child tables before parents (drop `subscriptions`/`memberships` before `tenants`), or `DROP TABLE tenants` fails via the implicit-delete FK check.
4. **Stale `test.db` pollution:** vitest shares `file:test.db` across runs (set in `test/setup.ts`); isolated `npx vitest run <file>` leaves rows behind. Use unique stamped emails / clear tables in `beforeAll`, and `rm -f test.db` before a definitive full run.
5. **A `"use server"` file may ONLY export async functions.** Constants (e.g. `CONSENT_PURPOSES`) must live in a separate plain module (`consent-config.ts`).
6. **Installed `@anthropic-ai/sdk@0.69.0`** typings lack `output_config`/`effort` — omit it (kept `max_tokens` bounded instead).
7. **`.env.example` is gitignored** (`.env*`) — it was force-added (`git add -f`); it documents all env vars.
8. **Phase 3 is on `main`, unpushed.** Consider branching future large work again, or keep on main but don't push until go-live.

---

## 7. Go-live checklist (all user actions; all free to START)
To run the multi-tenant/billing/AI features for real (dev works fully mocked without any of these):
- **Turso:** `TURSO_PLATFORM_TOKEN` + `TURSO_ORG` (+ optional `TURSO_GROUP`) → real signups create real Turso DBs. Free token. Verify the Platform API response shape in `lib/tenancy/turso.ts` against current docs.
- **Stripe (test keys, free):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO`, `APP_BASE_URL`.
- **AI scribe:** `ANTHROPIC_API_KEY` + `DEEPGRAM_API_KEY` (~$0.20–0.30/consult; both have free trial credits). Dev works mocked.
- **Email:** `RESEND_API_KEY` + verified domain (reminders, magic links, plan delivery all mock without it).
- **Cron:** `CRON_SECRET` (set same value in Vercel; `vercel.json` already schedules `/api/cron/reminders` hourly).
- **Control DB in prod:** `CONTROL_DATABASE_URL` + `CONTROL_AUTH_TOKEN` (a remote libSQL control DB), then `npm run migrate:all`.
- **Deploy caution:** `main` → Vercel auto-deploy; set env vars BEFORE pushing, or signup/billing/scribe will error in prod.

The clinic's original single-tenant planner is ALSO live at clinic-supplement-planner.vercel.app with its own separate go-live items (admin pw, Resend domain, Lorna allergen sign-off, etc.) tracked in the older memory file `supplement-selection-db-project.md` — those pre-date the super-app and are independent.

---

## 8. Docs map (in-repo)
- Specs: `docs/superpowers/specs/2026-10-30-multi-tenant-saas-foundation-design.md` (Phase 0), `...-phase1-client-crm-design.md`, `...-phase2-booking-portal-design.md`, `2026-10-31-phase3-design.md`.
- Plans: `docs/superpowers/plans/2026-10-30-phase0{a,b,c,d,e}-*.md`, `...-phase1{a,b,c}-*.md`, `...-phase2{a,b,c,d}-*.md`, `2026-10-31-phase3a-1-ai-providers.md`, `2026-10-31-phase3a-2-scribe-endpoint-and-ui.md`.
- Memory (persistent, outside repo): `~/.claude/projects/-Users-utkarshrawat-Wild-Dash/memory/supplement-superapp-project.md` (very detailed, kept current) and index `MEMORY.md`.

---

## 9. Working style / conventions
- **superpowers workflow:** brainstorm (scope + decisions) → write spec → write plan (TDD, bite-sized) → execute with TDD → verify in browser → commit per task. Each feature followed this.
- **TDD:** failing test first, minimal impl, pass, commit. Mock-safe for all external services.
- **Commits:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Verification:** browser-smoke every user-facing feature via the preview pane (preview_start name "supplement-db-dev", port 3200); confirm no server errors; stop the server after.
- The user is decisive and prefers momentum — present a clear recommendation and proceed; they often say "go ahead". Keep the GDPR/human-in-the-loop posture for anything clinical or AI.
