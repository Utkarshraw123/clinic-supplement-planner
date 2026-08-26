# Clinic Supplement Planner — Master Handover

**Read this first.** Single, self-contained entry point for a fresh session. Last written **2026-08-25**.

---

## 0. TL;DR

- **What:** an internal clinical tool for a nutrition clinic (Lorna's) to build client supplement plans, flag allergy/contraindication conflicts, export a branded PDF, and email it to the client. Standalone — NOT part of the Wild Nutrition practitioner-portal (different project; keep separate).
- **Stack:** Next.js 14 (App Router) · Turso/libSQL (raw SQL, no ORM) · email/password auth · server-side PDF (`@react-pdf/renderer`) · email via `resend` (mock without key).
- **Repo:** `/Users/utkarshrawat/Wild Dash/supplement-selection-db` (holds `.git`; the parent `Wild Dash/` is NOT a repo). Branch **`main`**, HEAD **`22b1977`**.
- **GitHub:** `https://github.com/Utkarshraw123/clinic-supplement-planner` — **private**, personal account **Utkarshraw123** (auth via macOS keychain; `git push` just works).
- **State:** **all 5 planned phases + a 6-item enhancement round built, tested, merged, pushed AND DEPLOYED TO PRODUCTION. 54/54 vitest tests pass. `npm run build` clean (23 routes).**
- **LIVE (2026-08-26):** **https://clinic-supplement-planner.vercel.app** (Vercel project `utkarsh-projects12/clinic-supplement-planner`, personal acct `utkarshrawatofficial-2811` / GitHub-connected → push to `main` auto-deploys). Prod DB = Turso `clinic-supplement-planner` (org `utkarshraw123`, aws-eu-west-1) — migrated + admin + dosing seeded + clinic_name "Lorna's Nutrition Clinic". Prod env vars set in Vercel (Production): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (all hidden). Admin login `admin@clinic.test` (password generated at deploy, given to user in chat — NOT stored here; user to change). **NOT yet set: `RESEND_API_KEY`** → email runs in mock mode; download/WhatsApp delivery works. Add the key via `vercel env add RESEND_API_KEY production` then redeploy. Unique per-deployment URLs are Vercel-SSO-protected; the alias above is public.
- **Theme:** re-themed navy → **deep forest green** (2026-08-25) and brand tokens renamed `--navy*` → **`--brand`/`--brand-2`/`--brand-ink`** in `app/globals.css` (#1B4332 / #122E23 / #1C3A2E). No `--navy*` tokens remain anywhere.

### 2026-08-25 enhancement round (all shipped, see commit 22b1977)
1. **Allergen safety** — loud "Allergen conflict" banner on the plan builder; finalisation hard-refuses a blocked plan (`finalisePlanToSnapshot` throws). Was already blocked at send; now blocked at finalise + explained.
2. **Optional-email delivery** — finalising always creates a downloadable PDF snapshot; client email is now OPTIONAL. `lib/delivery.ts` split into `finalisePlanToSnapshot` (download-only) + `sendSnapshotEmail` (send later); `finaliseAndSend` kept as a wrapper. Finalise redirects to `/patients/{id}/history`, which shows Sent/Finalised status, View, **Download PDF** (`?download=1` = attachment), and an "Email this plan" form for un-sent snapshots.
3. **Admin analytics** — `lib/analytics.ts` (`getPractitionerBreakdown`, `getPracticeTotals`). Per-practitioner table (patients / plans built / finalised / sent) on the dashboard (admin only) + dedicated `/admin/analytics` page (admin-only, nav item "Analytics"). Head nutritionist = `admin` role; her nutritionists = `team` (they don't see it).
4. **Patients UX** — "Add patient" moved into a deep-green section header bar (`components/PageHeader.tsx`, `.page-header` CSS). Same header on catalog + analytics. Fixed invalid `<Link><button>` nesting (now `<Link className="btn ...">`; new `.btn` anchor-button base class).
5. **Product autofill** — `/catalog/new` is now a full form (`components/ProductForm.tsx`) that scans a pasted product link and auto-fills name/size/form + tags **including allergens** (suggest-and-confirm; practitioner confirms by saving). Link is saved as a supplier link. Parser: `lib/enrich.ts` `parseProductHtml` / `enrichProductFromUrl` (og:title/title, size regex, form keywords, `extractAllKnownTerms`). Live outbound fetch WORKS in this env (verified against a real wildnutrition.com page).
6. **CSV export** — `lib/csv.ts` (`toCsv`, `csvResponse`) + `/api/export/{patients,products,analytics}` (analytics is admin-only). Export buttons on patients, catalog, analytics headers.
- **Dev URL:** http://localhost:3200 · **admin login:** `admin@clinic.test` / `wild-admin-2026`.

### Quick start
```bash
cd "/Users/utkarshrawat/Wild Dash/supplement-selection-db"
npm install
npm run seed                         # migrations + seed admin (admin@clinic.test / wild-admin-2026)
npx tsx scripts/seed-dosing.ts       # standard dosing presets
npx tsx scripts/seed-demo.ts         # 2 brands + 4 products, magnesium tagged mushroom+sleep
npx tsx scripts/seed-clinical-demo.ts# patient "Emma Hartley" (mushroom allergy) + a blocked plan
npm run dev                          # http://localhost:3200  → sign in → lands on /dashboard
npx vitest run                       # 54 tests, keep green
npm run build                        # production build + typecheck (STOP dev server first)
```

---

## 1. Product summary (what it does)

A practitioner signs in and works from a **deep-green-sidebar dashboard**. They:
1. Maintain a **product catalog** — brands → products, each tagged from controlled vocabularies (ingredients, allergens, concerns, diets, cautions), with multiple supplier links and alternative-format links. Import via CSV; a paste-a-URL "enrichment assist" suggests known terms.
2. Maintain **patient records** — Name + DOB only as identifiers, plus clinical attributes (allergies, health goals, dietary prefs, meds/conditions).
3. Build a **supplement plan** per patient in the plan builder: add products (or accept **allergy-safe ranked suggestions**), set dosing (preset or custom), offer alternative formats. **Deterministic flagging** hard-**blocks** any product whose ingredient/allergen matches the patient's allergy and soft-**warns** on caution/diet mismatches.
4. **Finalise & send** — re-checks safety, generates a **clinic-branded PDF**, snapshots it, emails it to the client (mock mode without a Resend key), and logs an audit event. History of sent plans is kept per patient, each PDF downloadable.
5. Reuse **protocols** — save any plan as a named protocol and apply it to any patient in one step (flagging re-runs on apply).
6. See a **dashboard** — greeting, stat cards (patients, drafts, sent this week/all-time), recent patients, recently sent.

Design principles that are load-bearing (do not violate):
- **Rules-based, deterministic, no LLM** anywhere in the clinical path. Flagging/suggestions are set-based and explainable.
- **Safety is a gate, never a weight:** an allergen match is a HARD block; a plan with any active block cannot be finalised/sent (re-checked at send time in `lib/delivery.ts`).
- **Controlled taxonomies** back all clinical tags so "mushroom" reliably matches "mushroom".
- **Data minimisation:** patients store Name + DOB only. Client email is captured at send-time and stored only on the snapshot's send record — there is NO email column on `patients`. Do not add one.
- **Clinic-owned branding:** the sidebar/PDF show the clinic name from Settings, never hard-coded "Wild Nutrition".

---

## 2. Tech stack & conventions

- **Next.js 14.2.x App Router.** Server components + server actions for mutations; a few route handlers (`/api/*`).
- **Turso (libSQL)** via `@libsql/client`. Local dev uses `file:local.db` when `TURSO_DATABASE_URL` is unset. **Raw parameterised SQL only, no ORM.** Every `lib/*` db function is `async`. Query helpers: `query<T>(sql, args)` / `execute(sql, args)` in `lib/db.ts`.
- **TypeScript strict.** Pinned **typescript@5.6.3** — Next 14 crashes on TS 7 (which npm resolves by default in this 2026 env). Do not bump TS to 7.
- **Auth:** bcrypt (`bcryptjs`) hashed passwords; signed session JWT (`jose`) in an HTTP-only cookie named `sess`; `middleware.ts` guards everything except `/login` + `/api/login`. Roles: `admin` / `team`. Helpers in `lib/auth/`: `getCurrentUser`, `requireUser`, `requireAdmin`.
- **PDF:** `@react-pdf/renderer` in `lib/pdf.tsx` (pure JS, serverless-safe — no headless browser).
- **Email:** `resend` in `lib/email.ts`; **mock mode** (console log, no send) when `RESEND_API_KEY` unset.
- **Fonts:** `next/font/google` — **Fraunces** (serif headings, `--font-serif`) + **Inter** (body, `--font-sans`).
- **Tests:** Vitest, TDD. `test/setup.ts` points tests at a dedicated `file:test.db`; `fileParallelism:false` + the `@vitejs/plugin-react` plugin (needed to transform `.tsx` like `pdf.tsx`). Alias `@` → repo root via `fileURLToPath` (NOT `.pathname` — the space in "Wild Dash" would percent-encode).
- **CLI scripts** run via **`tsx`** (resolves the `@/` alias; `ts-node/esm` does NOT). `npm run migrate` / `npm run seed`, and `npx tsx scripts/*.ts`.
- **Dev server port 3200.**

---

## 3. Repository map

```
app/
  page.tsx                     → redirect to /dashboard
  layout.tsx                   fonts (Fraunces+Inter) + <AppShell>
  globals.css                  DESIGN SYSTEM: tokens + base element styling + class kit
  login/page.tsx               chrome-free sign-in (posts /api/login → /dashboard)
  dashboard/page.tsx           greeting + stat cards + recent patients/sent
  patients/                    list, new, [id] profile, [id]/history, actions.ts
  plan/[patientId]/page.tsx    THE plan builder (suggestions, flags, dosing, protocols, finalise)
  plan/actions.ts              add/remove item, dosing, alternative, finalise&send
  protocols/page.tsx, actions.ts   protocols index + save/apply/delete actions
  catalog/                     page (search), new, brands, import, products/[id] editor + actions
  admin/                       users, taxonomies, settings (each page.tsx + actions.ts) — admin only
  api/                         login, logout, products/search, snapshots/[id]/pdf
components/
  AppShell.tsx                 navy sidebar shell (reads user + clinic name)
  SidebarNav.tsx               client nav w/ active highlight + inline-SVG icons
  SignOutButton.tsx            POST /api/logout
  ProductSearch.tsx            debounced catalog search (client)
  PlanItemDosing.tsx           dosing preset/custom form (client)
  EnrichAssist.tsx             paste-URL term suggester (client)
lib/
  db.ts schema.sql             db client + full schema (17 tables)
  auth/ (password, session, current-user)
  users.ts brands.ts products.ts taxonomies.ts   (Plan 1)
  patients.ts flagging.ts plans.ts settings.ts pdf.tsx email.ts delivery.ts audit.ts  (Plan 2)
  recommend.ts enrich.ts        (Plan 3)
  protocols.ts dashboard.ts     (Plan 5)
  import.ts                     CSV importer
scripts/                        migrate, seed-admin, seed-dosing, seed-demo, seed-clinical-demo
test/                           27 test files, 54 tests
docs/superpowers/
  specs/2026-08-25-supplement-selection-database-design.md   the approved design spec
  plans/                        the 5 implementation plans (see §5)
```

---

## 4. Data model (17 tables in `lib/schema.sql`)

- **users** (id, email, password_hash, role admin|team, name)
- **brands** (id, name, logo_url, website)
- **products** (id, brand_id→, name, package_size, form, status active|archived)
- **taxonomy_terms** (id, type allergen|ingredient|concern|diet|caution, label, UNIQUE(type,label))
- **product_tags** (product_id→, taxonomy_term_id→, tag_type) — the matching backbone
- **supplier_links** (id, product_id→, label, url) — many per product
- **product_alternatives** (product_id→, alternative_product_id→) — symmetric (both directions written)
- **clinic_settings** (single row id=1: clinic_name, logo_url, address, contact, email_from)
- **patients** (id, name, dob, created_by→) — identifiers = Name + DOB ONLY
- **patient_attributes** (patient_id→, taxonomy_term_id→, attr_type allergy|goal|diet|med_condition)
- **dosing_presets** (id, label, text)
- **plans** (id, patient_id→, status draft|finalised, author_id→, created_at, updated_at)
- **plan_items** (id, plan_id→, product_id→, dosing_preset_id?, dosing_custom_text?, chosen_alternative_id?, position)
- **plan_snapshots** (id, plan_id→, frozen_json, pdf_base64, sent_to_email?, sent_at?, sent_by?) — the archive; PDF stored base64
- **audit_events** (id, actor_id→, action, entity, entity_id, detail)
- **protocols** (id, name, description, created_by→)
- **protocol_items** (id, protocol_id→, product_id→, dosing_preset_id?, dosing_custom_text?, position)

**FKs are enforced.** Passing a `created_by`/`author_id` that isn't a real user id fails (that bit a protocols test — tests pass `undefined`; real server actions pass the logged-in `u.userId`, which is valid).

Key behaviours:
- A patient has one evolving **draft** plan (`getOrCreateDraftPlan`). Finalising flips it to `finalised`; a fresh draft is created next time. **History must query snapshots by PATIENT** (`listSnapshotsForPatient`), not by the current draft plan — this was a fixed bug.
- Dosing: custom text overrides preset (`dosingTextFor`).

---

## 5. The five plans (all DONE) — `docs/superpowers/plans/`

1. **foundation** — scaffold, auth/roles, DB layer + schema, taxonomies, full catalog (brands/products/tags/suppliers/alternatives/search/CSV import).
2. **clinical-core** — patients + attributes, deterministic **flagging** (`lib/flagging.ts`), plan builder, dosing presets, branded **PDF**, **email** send (mock), **snapshots**, **audit**, clinic settings editor, patient history + PDF download route.
3. **recommendations-enrichment** — two-stage **recommendation** engine (`lib/recommend.ts`: filter unsafe/hard-diet → rank by goal score, with reasons), surfaced in the plan builder; paste-URL **enrichment** assist (`lib/enrich.ts` — deterministic `extractKnownTerms`, suggest-and-confirm).
4. **ui-polish** — first design system pass (later superseded by Plan 5's re-theme).
5. **hub-retheme-and-features** — re-themed to the deck aesthetic (see §6) + **Dashboard** (`lib/dashboard.ts`, `/dashboard`) + **Protocols** (`lib/protocols.ts`, `/protocols`, plan-builder integration).

The design spec (approved) is in `docs/superpowers/specs/`.

---

## 6. Design system (current look — from the "Hub Ideas v2" deck)

Deep-navy left sidebar + cream canvas + sand cards + serif display headings; warm, premium, editorial. All tokens live in `app/globals.css` on `:root`:

- `--brand` #1B4332 · `--brand-2` #122E23 (sidebar) · `--brand-ink` #1C3A2E (text) — deep forest green (renamed from --navy*, formerly navy #10243A/#0B1B2C/#1F2D38)
- `--cream` #FAF5EE (canvas) · `--sand` #F3EBDF (cards) · `--sand-border` #E7DDCD
- `--terracotta` #C06A47 (+tint #F3E3DA) — icons, eyebrows, accents
- `--sage` #8DA06A (+tint #EBEFE1) — suggestions, "ok" badges
- Semantic: danger #B42318/#FEF3F2 (blocks), warn #98590B/#FBF0DC, ok/sage for safe.
- Fonts: **Fraunces** headings, **Inter** body.
- Class kit: `.page`, `.card` (+`.card--plain` white, `--pad-lg`), `.list-row`, `.badge`(+`--danger/warn/ok/neutral`), `.eyebrow`, `.btn--primary`(navy)/`.btn--accent`(terracotta)/`.btn--sm`, `.stat-num`, `.muted`/`.muted-xs`, `.stack`, `.row-between`.

The **PDF** (`lib/pdf.tsx`) is separately styled (green letterhead `#0F6E56`) and already branded — leave it unless asked.

Deck source: `/Users/utkarshrawat/Desktop/Hub Ideas v 2 (6).pdf`. To view it in a fresh session there's no `pdftoppm`/`brew`; extract images with `python3` + `pypdf` (`page.images`) — see the last session's method.

---

## 7. Gotchas / traps (READ before editing)

- **`git push` / `git remote add` get BLOCKED by the CC auto-mode classifier when piped** (e.g. `| tail`). Run them **bare**, no pipe. (Merging/committing are fine.)
- **Never build dev servers via Bash** — use `preview_start` with launch name **`supplement-db-dev`**. That launch config lives in the SESSION-ROOT `/Users/utkarshrawat/Wild Dash/.claude/launch.json` (uses `npm --prefix supplement-selection-db run dev`), because the preview system reads launch.json from the session root, NOT this subdir. The subdir's own `.claude/launch.json` is ignored by preview.
- **After adding a new font (`next/font`) or a new component imported by layout/shell, `rm -rf .next` and restart** — HMR keeps a stale module graph and 404s the import otherwise.
- **`@react-pdf/renderer` does NOT run under `tsx`** (`@react-pdf/hyphenate` `./en-us` exports error). It works fine under Next runtime and Vitest. So don't try to exercise PDF generation from a standalone `tsx` script — verify it via the app or `test/pdf.test.ts` / `test/delivery.test.ts`.
- **`resend` must stay installed** even though email is mock-by-default — Next resolves the dynamic import at build time.
- **`typescript` pinned to 5.6.3** — do not upgrade to 7 (Next 14 breaks).
- **Tests must run serially against `test.db`** (already configured). Don't remove `fileParallelism:false` or the react plugin from `vitest.config.ts`.
- **Browser automation quirks:** the in-app preview sometimes reports a 0×0 viewport; `computer` clicks by ref then fail. Workarounds that worked: `resize_window` to desktop, or drive forms via `javascript_tool` (`form.requestSubmit()` after setting values), and read state with `get_page_text` / `read_page`.
- **Don't blind-`git add -A` + force anything.** The tree is clean; commit specific paths.

---

## 8. How to verify (evidence, not vibes)

```bash
npx vitest run          # expect: 54 passed
npm run build           # expect: Compiled successfully, 19 routes (stop dev server first)
```
Then in the browser (preview `supplement-db-dev`), log in and check:
- `/dashboard` — greeting + stat cards + recents
- `/plan/1` (Emma, mushroom allergy) — Magnesium shows red **Blocked**, finalise hidden; suggestion card shows allergy-safe Vitamin D
- `/protocols` — save a plan as protocol, apply to a patient, confirm items add + flags recompute
- Finalise a clean plan → `/patients/{id}/history` → Download PDF returns `application/pdf`

---

## 9. Go-live (the only remaining work)

1. **Turso prod DB:** create it, set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, run migrations against it (`TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run migrate`), seed an admin (`… npm run seed`, ideally with a strong `SEED_ADMIN_PASSWORD`).
2. **Email:** set `RESEND_API_KEY` (+ verify a sending domain); set the send-from in `/admin/settings`.
3. **Branding:** `/admin/settings` — clinic name (drives sidebar + PDF), address, contact. Dev value is "Lorna's Nutrition Clinic".
4. **Auth secret:** set a strong `SESSION_SECRET` (≥32 chars).
5. **Deploy to Vercel** (same pattern as the user's other projects; Vercel CLI is authed on this machine for other accounts — confirm which account/team for this repo). Set the env vars above in Vercel.

Env reference is in `.env.example`.

---

## 10. Not-yet-built ideas (from the deck, if the user wants more)

The user picked only **Dashboard + Protocols** this round. The deck (`Hub Ideas v2`) also suggests, and these fit the tool if requested: **Ask-Lorna style global/AI search**, **clone-a-plan** from history, **patient-facing handout PDF** (plain-language), a dedicated **contraindication/interaction checker** view, **learning pathways / CPD**, **community & events** (these last two are really the broader Wild Nutrition Hub / practitioner-portal, a separate project — don't fold them in without confirming scope).

Each new feature should go through the same rhythm: brainstorm → spec/plan in `docs/superpowers/` → TDD for logic, visual-verify for UI → branch → merge to main → push (bare `git push`).

---

## 11. Memory pointer

Persistent memory for this project: `~/.claude/projects/-Users-utkarshrawat-Wild-Dash/memory/supplement-selection-db-project.md` (indexed in that dir's `MEMORY.md`). It mirrors this handover in condensed form and is loaded automatically each session.
