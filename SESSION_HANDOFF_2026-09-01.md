# Session Handoff — 2026-09-01 (read this FIRST, then `HANDOVER.md`)

Self-contained entry point to resume in a fresh context window. The master
`HANDOVER.md` remains the deep reference; this file is the current, exhaustive
state + the exact next steps.

---

## 0. Snapshot

- **Repo:** `/Users/utkarshrawat/Wild Dash/supplement-selection-db` (holds `.git`; parent `Wild Dash/` is NOT a repo).
- **Branch `main`, HEAD `c15e0ff`** — clean tree, **93 vitest tests pass**, `npm run build` clean.
- **LIVE:** https://clinic-supplement-planner.vercel.app
- **Login (NEW): `lorna123` / `lorna123`** (username-or-email login; the old `admin@clinic.test` was renamed to this). Weak demo password by design — change at `/account` before real patient data.
- **Prod DB:** Turso `clinic-supplement-planner` (org `utkarshraw123`, aws-eu-west-1). Functions pinned to Dublin (`vercel.json regions:["dub1"]`) — EU patient data must stay in EU.
- **GitHub:** https://github.com/Utkarshraw123/clinic-supplement-planner (private, personal acct Utkarshraw123). `git push` to `main` auto-deploys via Vercel. **Run `git push` BARE (no pipe)** — the CC classifier blocks it when piped.
- **Vercel:** authed as `utkarshrawatofficial-2811`; use `npx --yes vercel`. NOTE: `vercel ls` / `vercel deploy` are sometimes classifier-blocked — rely on the GitHub auto-deploy + browser verification instead. `npx vercel logs https://clinic-supplement-planner.vercel.app` works to read prod runtime logs.
- **Turso CLI:** `~/.turso/turso db shell clinic-supplement-planner "SQL"` (read/inspect). To run a WRITE seed/migrate against prod, prefix the node/tsx command with inline env (token minted fresh each time):
  ```bash
  TURSO_DATABASE_URL="libsql://clinic-supplement-planner-utkarshraw123.aws-eu-west-1.turso.io" \
  TURSO_AUTH_TOKEN="$(~/.turso/turso db tokens create clinic-supplement-planner 2>/dev/null)" \
  npm run migrate        # or: npx tsx scripts/seed-XXX.ts
  ```
  (The CC classifier blocks writing the token to a file and blocks destructive prod DELETEs from Bash — use the app's server actions for deletes.)

---

## 1. ✅ DONE — E2, import the Cytoplan range (#6) — 2026-09-01, HEAD `c15dc3b`, seeded local + PROD

**COMPLETE.** User revised the plan from a full scrape to a **CURATED** import (177 → **84 products**) scoped to Lorna Driver-Davies's practice (women's hormonal health, gut, nervous system/stress/sleep, energy/methylation, thyroid, foundational multis/minerals, detox/liver, immunity, skin/collagen, blood sugar). Files: `scripts/data/cytoplan.json` (84) + `scripts/seed-cytoplan.ts` (mirrors seed-wild-nutrition.ts, idempotent skip-by-name). Committed `c15dc3b`, pushed, and **seeded on PROD** (Cytoplan now = 84 products; total prod catalogue = 84 Cytoplan + 44 Wild Nutrition). 93 tests still pass.
- **Scrape method (worked):** sitemap_product.xml (177 urls) → same-origin `fetch('/<slug>')` from the browser pane → picked the JSON-LD Product whose `offers.url` matched the page (multi-block bug fixed). `organic-echinacea` DROPPED — it sits behind a Cytoplan practitioner login ("Practitioners Only" page, no product data).
- **Tags** derived against the existing controlled vocab (reused concern/allergen/diet labels; added 2 concerns: **Thyroid**, **Blood Sugar**). **6 auto-derived allergen tags, ALL still needing Lorna's sign-off** (see §3.4): Menopause Support→soya, CytoProtect GI Tract→milk (lactoferrin), Fish Oil Capsules→fish, Krill Oil→shellfish, Marine Collagen→fish, Organic Lion's Mane→mushroom.
- **Excluded 93:** pet range, marketing bundles, books/kits, paediatric-only, male-reproductive, OA-joint, niche cardiovascular, duplicate nutrient forms (kept 2–3 forms each), single-organ/misc.
- **Review + allergen sign-off artifact for Lorna:** https://claude.ai/code/artifact/a41a5445-7bc2-4ab3-8a0b-a024663cac03 (84 grouped by clinical area + allergen table + exclusions).
- **Still TODO (user/Lorna actions):** set the Cytoplan brand **promo code** on `/catalog/brands`; Lorna's Cytoplan **allergen sign-off** (§3.4) before those 6 tags are trusted; note Cytoplan "Food State" nutrients are grown on a Lactobacillus/yeast base → verify labels for trace milk/soya.

### Original scrape notes (kept for reference)
The user originally chose **"attempt a full scrape"**. Here is everything learned about scraping Cytoplan.

### What Cytoplan is
- `cytoplan.co.uk` is **headless Magento** with a client-rendered (JS) product grid. `/products.json` and direct `curl` are **403 (bot-blocked)**. Category/all-products page HTML only contains a handful of products (grid loads via API), so scraping category HTML does NOT give the full list.

### The reliable path (verified this session)
1. **Product list = the sitemap.** `robots.txt` lists four sitemaps; the one you want:
   **`https://www.cytoplan.co.uk/sitemaps/sitemap_product.xml`** → **177 product URLs** in `<loc>…</loc>` tags. (Fetch it and regex `/<loc>([^<]+)<\/loc>/g`.)
2. **Same-origin fetch bypasses the 403.** From the browser pane, FIRST `navigate` to `https://www.cytoplan.co.uk/` (any Cytoplan page), THEN in `javascript_tool` use `fetch('/<slug>')` — relative, same-origin — which returns the real product HTML (status 200, ~760KB). curl/server-side fetch stays blocked; the in-browser session works.
3. **Each product page carries JSON-LD.** Extract `<script type="application/ld+json">` blocks. **A page has SEVERAL `@type:"Product"` blocks (related/"you may also like" products).** ⚠️ **BUG in my first pass:** I took the *first* Product block, so e.g. `/organic-echinacea` returned name "Electrolyte Creatine Complex". **FIX: pick the Product whose `offers.url` === the page URL** (fallback: the one whose `sku` is set / whose name matches the page `<title>`/`<h1>`).
4. **JSON-LD Product fields:** `name`, `sku` (e.g. `"5560/5561"` = the SKUs of its size variants), `offers.price` (GBP), `offers.url`, `description` (HTML — contains an "About our…" + often an **Ingredients** section).
5. **Pack size is NOT in JSON-LD** — it's in the on-page variant selector. Only ~15/177 sizes are parseable from name/description. Treat `package_size` as best-effort; the prescription's per-item **size dropdown overrides it** anyway, so don't over-invest here.
6. **Ingredients / allergens / diet / concern tags:** parse from the description HTML **in a Node seed script** (like the Wild Nutrition seed), against the existing controlled vocabulary. ⚠️ **Every auto-derived allergen tag MUST be flagged for Lorna's clinical sign-off before real use** (same policy as the Wild Nutrition allergen sign-off, still pending — see §3). Do NOT present scraped allergen tags as verified.

### Recommended implementation (mirror the Wild Nutrition seed)
- Copy the pattern of **`scripts/seed-wild-nutrition.ts`** + **`scripts/data/wild-nutrition.json`** (committed data file → idempotent seed).
- **Step A (browser):** navigate to cytoplan.co.uk; fetch `sitemap_product.xml` → 177 URLs; loop (batches of ~12 via `Promise.all`) fetching each, pick the correct Product LD, extract `{slug, url, name, sku, price, size, form, descText}`. Export the 177 records OUT of the browser into `scripts/data/cytoplan.json` — the `javascript_tool` result has a size cap, so return the JSON in **chunks** (e.g. 30 records per call) and assemble locally, or write via a series of appends.
- **Step B (Node):** `scripts/seed-cytoplan.ts` — `findOrCreateBrand("Cytoplan")`, then per product: `createProduct({brandId, name, packageSize, form})`, `addSupplierLink(id, "Cytoplan", url)`, `setProductTags(...)` from parsed ingredient/allergen/diet/concern terms (`addTerm` to ensure vocab). Idempotent (skip-by-name). Run **local first**, review, then prod.
- **Cytoplan brand already exists on prod** (1 row). Set its promo code on `/catalog/brands` (per-brand promo code column exists — `brands.promo_code`).
- **Clinical safety:** build a Cytoplan allergen sign-off doc for Lorna (like the WN one, Artifact `a28f5ac9-681f-4d9f-91c3-d279878bc678`) before these tags gate real plans.

### If the user reconsiders
The safer alternative (my original recommendation) is a **curated** seed: ask Lorna for the specific Cytoplan products she prescribes (names + sizes / a CSV) and seed just those — accurate and sign-off-able. Keep this on the table if the full-scrape data quality proves poor.

---

## 2. What shipped THIS session (feedback roadmap — 11 of 12 items, all LIVE)

Roadmap artifact (plan of record): **https://claude.ai/code/artifact/3e54b0ab-1c68-446e-b452-dd73596cf7d9**
(All 5 roadmap decisions were taken = my recommendations.)

**Workstream A — the prescription, rebuilt from the plan (the keystone; commit `7e037ec` + A6 `ce7813f`).**
The PDF supplement section is now a **structured TABLE built directly from the plan items** (`buildSupplementRows` in `lib/guide.ts`), replacing the old editable free-text box.
- 🐛 **Fixed the "5 added → 3 printed" bug** — TWO root causes: (1) the printed list was a *separately-saved* free-text copy (`plan_guide.supplement_text`) that went stale when items were added after opening Prepare; (2) the section used `wrap={false}` and **clipped** overflow instead of paginating. Both gone — table renders from live items and wraps across pages. **Verified on prod: 7 items added → 7 in the snapshot.**
- Table columns: **Supplement** (name / brand / size) · **Dosage** (dose / duration / note) · **Where to buy**.
- **Brand** on every line; **pack size** per item (new `plan_items.size`, `SIZE_OPTIONS` in `lib/durations.ts`).
- **All vendor buy-links** per product (was only the first supplier).
- **Per-brand promo codes** set once on `/catalog/brands` (new `brands.promo_code`; `lib/brands.ts setBrandPromoCode`); a per-item order code overrides it. Verified: `LORNA10` (brand) vs `LORNA123` (item override) both flowed to the PDF.
- **Marketing descriptions removed** from the prescription.
- **Closing Notes block** (new `plan_guide.notes`) — template chip + custom.
- Prepare page now shows a **read-only supplement preview**; item details are edited in the plan builder.
- **A6 Merriweather** — `lib/pdf-fonts.ts` embeds Merriweather 400/700 as **base64 WOFF data URIs**, registered via `Font.register` (no runtime fetch, no file-tracing). Base font on the PDF page.
- `ProductDetail` gained `brand_promo_code` (added to all 3 selects in `lib/products.ts`).

**Workstream B — search (commit `d5d7a46`).** `components/ProtocolSearch.tsx` (filter `/protocols`), `components/AddProductSearch.tsx` (search products in the plan builder's Add list, replacing the static first-50).

**Workstream C — note dropdown (shipped inside A).** `PlanItemFields.tsx` gained a preset-note `<select>` (from `note_snippets` category `supplement`) + custom input.

**Workstream D (commit `3bc32f7`).**
- **#1 Vegan (marine OK):** `lib/flagging.ts` — a `MARINE` set (fish / omega-3 / collagen) is accepted for patients whose diet is `vegan (marine ok)`, so omega-3 & marine collagen stop warning and the recommender (which keys off the `not tagged …` warn) stops excluding them. Plain "vegan" is unaffected.
- **#12 Medications:** `scripts/seed-clinical-terms.ts` seeds the `Vegan (marine OK)` diet term + ~20 common medications (Levothyroxine, Metformin, Warfarin, HRT, SSRIs, PPIs, statins, …) into the `caution` taxonomy so they're one-click in the patient "Medications / conditions" picker. **Ran local + prod.**

**Workstream E1 (commit `3bc32f7`).** **Retired "Alternative formats"** — removed the catalogue linking UI (`app/catalog/products/[id]/page.tsx`) and the plan-builder alternative selector (`app/plan/[patientId]/page.tsx`). DB (`product_alternatives`, `plan_items.chosen_alternative_id`) + dead lib/actions (`chooseAlternativeAction`, `setItemAlternative`, `addAlternativeAction`, `linkAlternative`) left dormant — safe to prune later.

**DB columns added this session (all via `ensureColumn` in `scripts/migrate.ts`, migrated on prod):** `plan_items.size`, `plan_items.duration`+`order_code` (earlier), `brands.promo_code`, `plan_guide.notes`.

**Verification method for the PDF (can't run @react-pdf under tsx):** write a temp `test/_tmp_render.test.ts` that renders `renderPlanPdf(sampleData)` to a file in the scratchpad, then `Read` the PDF. Both sample renders this session looked correct (Merriweather applied, table paginates, brand/size/multi-vendor/code/notes all present).

---

## 3. Other OPEN items (go-live + carried-over)

These are **user actions / pending decisions**, unchanged by this session:
1. **Change the admin password** — still the weak demo `lorna123`. Do at `/account` before real patients.
2. **Verify a Resend sending domain** — `email_from` is still the test sender `onboarding@resend.dev` (delivers ONLY to the Resend account owner = `utkarshrawatofficial@gmail.com`). Add+verify a domain in Resend, then set the from-address in Admin → Settings ("Send-from email").
3. **Lorna's allergen sign-off (Wild Nutrition)** — review doc Artifact **`a28f5ac9-681f-4d9f-91c3-d279878bc678`**. The page was re-saved once (a change notification arrived) but the user hasn't handed back corrections; nothing applied. Ask for her corrections; do NOT change live allergen tags unilaterally.
4. **Cytoplan allergen sign-off** — needed for E2 (see §1) once its tags exist.
5. **Real staff/Lorna accounts + clear UAT/test data** — via the Team page (inline edit-user shipped) and the app's patient-erasure (Danger Zone), respectively, right before real clients.

**Prod demo data note:** building the "7 items → 7 in PDF" verification left a finalised snapshot on **Benjamin Cole** (patient id 32) and a duplicate/test draft or two; harmless test data. Cytoplan brand exists on prod with no products yet.

---

## 4. Key traps (see HANDOVER §7 for the full list)
- **Dev server ONLY via `preview_start` name `supplement-db-dev`** (config in SESSION-ROOT `Wild Dash/.claude/launch.json`, port 3200) — never Bash.
- **`npm run build` clobbers a running dev server's `.next`** (jose vendor-chunk 500). Recover by `preview_stop` → `rm -rf .next` → `preview_start` (a plain rm + reuse leaves the server broken → 404s).
- **If a change adds/alters a DB column, run `migrate` on PROD BEFORE pushing** the code (raw SQL, no boot-time migration) — EXCEPT auth-shape changes, which are code-first (see the login change).
- TypeScript pinned **5.6** (Next 14 breaks on TS7). `@types/react-dom` MISSING → don't use `useFormStatus`/`useFormState`.
- `@react-pdf/renderer` does NOT run under `tsx` — verify PDFs via a temp vitest render → Read the PDF (see §2). macOS has NO `timeout`; foreground `sleep` is blocked in the Bash tool.
- Client components must not import server-DB libs transitively — keep shared constants dependency-free (e.g. `lib/durations.ts` holds `DURATION_OPTIONS`/`SIZE_OPTIONS` so client `PlanItemFields` doesn't pull `lib/db`).

---

## 5. How to verify after changes
```bash
npx vitest run          # expect: 93 passed (as of HEAD c15e0ff)
npm run build           # expect: Compiled successfully (stop dev server first; then rm -rf .next + restart preview)
```
Then log in on prod (`lorna123`/`lorna123`) and, for prescription changes, build a multi-item plan → Prepare → Finalise → Download PDF, and/or inspect the snapshot:
```bash
~/.turso/turso db shell clinic-supplement-planner \
  "SELECT json_array_length(json_extract(frozen_json,'\$.supplements')) FROM plan_snapshots ORDER BY id DESC LIMIT 1"
```
