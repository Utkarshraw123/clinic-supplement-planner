# Phase 3c — Meal Plans (full Nutrium) — Design

**Date:** 2026-10-31
**Status:** Approved scope; ready to plan
**Author:** Utkarsh + Claude (Opus 4.8)

## Context

The last big piece of the supplement super-app's Phase 3. Phases 0–2 (multi-tenant GDPR foundation, CRM, booking/portal) and 3a (AI scribe) + 3b (client-facing invoicing) are done on `main`. 3c adds a **Nutrium-style meal planner**: a practitioner-maintained food database and recipe builder feeding a structured day × meal grid with hand-entered nutrition that auto-sums per meal/day, compares to targets, flags allergen/diet conflicts, exports a branded PDF, and is reusable as a template.

**No external dependencies** — there is no nutrient API; the practitioner enters all nutrition. Everything works fully offline at $0 (no keys needed except the existing mock-safe Resend for email).

## Decisions (from brainstorming)

- **Structure:** full Nutrium — foods + recipes + a day/meal grid with per-day nutrition totals (not free-text, not calorie-free).
- **Nutrients:** the full back-of-pack panel per food — `energy_kcal, protein_g, carbs_g, sugars_g, fat_g, saturates_g, fibre_g, salt_g`.
- **Units model:** nutrients are entered **per one practitioner-defined portion** (`portion_label`, e.g. "1 egg (50 g)"). A meal item = a food × a **portion count** (fractional allowed); nutrition scales linearly. A recipe = foods × portion counts ÷ a `servings` yield.
- **Recipes:** in the MVP.
- **MVP extras (all in):** allergen/diet flagging (warn), per-plan daily nutrient targets, reusable meal-plan templates.
- **Delivery:** branded PDF — download + mock-safe email. No patient-portal view.

## Load-bearing facts about the existing code (reuse these)

- **Taxonomy:** `taxonomy_terms(type IN 'allergen'|'ingredient'|'concern'|'diet'|'caution')`, `lib/taxonomies.ts` (`listTerms(type?)`, `addTerm`). Foods are tagged from this same vocabulary — the meal planner shares the allergen/diet vocabulary with the supplement engine.
- **Patient attributes:** `getPatient(id)` returns `attributes: { termId, label, attrType }[]` where `attrType IN 'allergy'|'goal'|'diet'|'med_condition'`. Flagging reads the patient's `allergy` and `diet` term ids.
- **Reusable-template pattern:** `lib/protocols.ts` `savePlanAsProtocol` / `applyProtocolToPlan` deep-copy a plan's items into/out of a template. Meal-plan templates mirror this, deep-copying the day/meal/item tree.
- **PDF:** `@react-pdf/renderer` via `lib/pdf-fonts.ts` (embedded Merriweather) — mirror the invoice/plan PDF. **Email:** `lib/email.ts` mock-safe Resend pattern (no `RESEND_API_KEY` → logged mock). **Download route** pattern: `app/api/invoices/[id]/pdf/route.ts` (authed `requireUser` → `application/pdf`).
- **GDPR:** `deletePatient` (`lib/patients.ts`) deletes every child table explicitly (PII-free audited); `lib/gdpr-export.ts` aggregates a patient's data. Both must learn about meal plans.
- **Migrations:** tables via `CREATE TABLE IF NOT EXISTS` in `lib/schema.sql`; later columns via `ensureColumn` in `scripts/migrate.ts`; `npm run migrate:all` after schema edits. **Never put `;` in a SQL comment.**
- **Admin UI shape:** `/admin/*` list+form pages (e.g. `/admin/dietary-protocols`) and the `AppShell` nav (`components/AppShell.tsx`).

## Data model (tenant DB)

### Food database
**`foods`** — `id`, `name`, `portion_label` TEXT (e.g. "1 egg (50 g)"), `energy_kcal`, `protein_g`, `carbs_g`, `sugars_g`, `fat_g`, `saturates_g`, `fibre_g`, `salt_g` (all REAL NOT NULL DEFAULT 0, **per one portion**), `status` TEXT CHECK(`active|archived`) default `active`, `created_by`, `created_at`.

**`food_tags`** — `(id, food_id REFERENCES foods ON DELETE CASCADE, taxonomy_term_id REFERENCES taxonomy_terms)`. Allergen tags (`term.type='allergen'`) mean **contains**; diet tags (`term.type='diet'`) mean **suitable for**.

### Recipes
**`recipes`** — `id`, `name`, `servings` INTEGER NOT NULL DEFAULT 1, `method` TEXT, `status` CHECK(`active|archived`) default `active`, `created_by`, `created_at`.
**`recipe_items`** — `id`, `recipe_id REFERENCES recipes ON DELETE CASCADE`, `food_id REFERENCES foods`, `portions` REAL NOT NULL DEFAULT 1, `sort` INTEGER DEFAULT 0.

### Meal plans (also used for templates)
**`meal_plans`** — `id`, `patient_id` INTEGER REFERENCES patients(id) ON DELETE CASCADE (**nullable**: templates have NULL), `is_template` INTEGER NOT NULL DEFAULT 0, `title` TEXT, `start_date` TEXT, `notes` TEXT, `target_kcal`/`target_protein_g`/`target_carbs_g`/`target_fat_g`/`target_fibre_g`/`target_salt_g` (nullable REAL — per-day targets), `status` TEXT CHECK(`draft|final`) default `draft`, `created_by`, `created_at`, `updated_at`.
**`meal_plan_days`** — `id`, `meal_plan_id REFERENCES meal_plans ON DELETE CASCADE`, `day_index` INTEGER, `label` TEXT (e.g. "Day 1"), `sort` INTEGER.
**`meal_plan_meals`** — `id`, `day_id REFERENCES meal_plan_days ON DELETE CASCADE`, `name` TEXT (e.g. "Breakfast"), `sort` INTEGER. A new day seeds a default slot set: Breakfast / Morning snack / Lunch / Afternoon snack / Dinner — renamable, add/remove.
**`meal_plan_items`** — `id`, `meal_id REFERENCES meal_plan_meals ON DELETE CASCADE`, `item_type` TEXT CHECK(`food|recipe`), `food_id` (nullable), `recipe_id` (nullable), `quantity` REAL NOT NULL DEFAULT 1 (portions for a food, servings for a recipe), `note` TEXT, `sort` INTEGER.

**Nutrition is always computed on read** from items + the referenced food/recipe panels — never stored stale. Deleting a food/recipe that a plan references is prevented by archiving (status), not hard delete, so historical plans stay resolvable (mirrors the product archive pattern).

## Nutrition math (pure, unit-tested)

- `foodNutrition(food, portions)` → each panel field × `portions`.
- `recipeNutrition(recipe, items)` → whole = Σ `foodNutrition(ingredient, portions)`; **per serving** = whole ÷ `servings`.
- `mealTotals(items)` / `dayTotals(meals)` → Σ of item nutrition, where an item = `foodNutrition(food, qty)` or `recipePerServing × qty`.
- All fields summed independently; REAL arithmetic, rounded for display only (1 decimal for grams, integer for kcal).

## Flagging (warn, never block)

Given the patient's `allergy` term ids and `diet` term ids:
- **Allergen warning** (high priority): any food in the plan whose `food_tags` include an allergen term the patient is allergic to → `"Day 1 · Lunch · Scrambled eggs — contains egg"`.
- **Diet warning:** a food that carries **at least one** diet-suitability tag but **none** matching the patient's diet → `"… may not suit Vegan"`. Foods with no diet tags are **not** flagged (avoids false positives on untagged foods).
- Recipes inherit their ingredient foods' allergen/diet tags (union).
- Warnings are surfaced in the builder and on the PDF; the practitioner authored the plan, so nothing is blocked.

## Library modules (one purpose each)

- `lib/foods.ts` — `createFood/updateFood/getFood/listFoods/archiveFood`, `setFoodTags(foodId, termIds)`, `listFoodTags(foodId)`, pure `foodNutrition(food, portions)`. Audited where patient-independent actions warrant (food create/edit are clinic-level, not patient audit).
- `lib/recipes.ts` — `createRecipe/updateRecipe/getRecipe/listRecipes/archiveRecipe`, `setRecipeItems`, pure `recipeNutrition` (+ per-serving) and `recipeAllergenTermIds`/`recipeDietTermIds`.
- `lib/meal-plans.ts` — plan + day + meal + item CRUD (draft-editable), `addDay` (seeds default meals), pure `mealTotals`/`dayTotals`, `planWarnings(planId, patientId)`, `finaliseMealPlan`, `saveAsTemplate(planId, title)`, `applyTemplate(templateId, patientId)` (deep-copy day/meal/item tree), `listMealPlansForPatient`, `listTemplates`. Audits `meal_plan_created/finalised` against the patient, PII-free.
- `lib/meal-plan-pdf.tsx` — branded react-pdf (days → meals → items with per-item + per-day totals vs targets + a warnings block). `renderMealPlanPdf(plan, tree, settings, patientName)`.
- `lib/email.ts` — add `sendMealPlanEmail` (mock-safe, mirrors `sendInvoiceEmail`).

## Routes / server actions / UI

- **Food DB:** `/admin/foods` (list + search + add/edit form with the 8-field panel + allergen/diet tag pickers + archive).
- **Recipes:** `/recipes` (list) + `/recipes/[id]` (builder: add foods × portions, set servings + method, live per-serving panel).
- **Meal plans:** `/meal-plans` (list, filter draft/final) + `/meal-plans/new` (title + patient + targets) + `/meal-plans/[id]` (the builder grid) + `/meal-plans/templates` (list + apply-to-patient). Actions: save draft, add/remove day, add/rename/remove meal slot, add/edit/remove item (food or recipe + quantity), finalise, download PDF, email, save as template.
- **Builder grid:** days as cards down the page; each day a set of meal-slot sub-cards; each slot a list of items with a food/recipe picker + quantity; a **live per-day totals bar** (kcal/P/C/F/sugars/sat/fibre/salt, coloured over/under each target) and a **warnings panel**.
- **PDF download:** `app/api/meal-plans/[id]/pdf/route.ts` (authed).
- **Patient page:** a **Meal plans card** (mirrors Notes/Invoices) + "New meal plan" prefilled. **Nav:** "Meal plans" link in `AppShell`.
- The item food/recipe pickers reuse the client-component pattern of the invoice line-item editor / product search (debounced search over active foods + recipes).

## GDPR / audit

- Extend `deletePatient` erasure to delete the patient's `meal_plan_items` → `meal_plan_meals` → `meal_plan_days` → `meal_plans` (where `patient_id = ?`); templates (patient_id NULL) and the food/recipe libraries are clinic-level, untouched.
- Extend `lib/gdpr-export.ts` to include the patient's meal plans (title, targets, status, and the day/meal/item tree with resolved names + computed nutrition).
- Audit `meal_plan_created`/`meal_plan_finalised` with PII-free detail (ids only).

## Mock-safety (dev $0)

No external services at all. Email reuses the existing mock-safe Resend path. The whole feature — build a food, a recipe, a multi-day plan, see totals vs targets, see allergen warnings, PDF, email (mock), save/apply a template — is exercisable and testable with **no keys**.

## Testing (TDD, per sub-plan)

- Pure nutrition: `foodNutrition` (scaling, fractional portions), `recipeNutrition` (whole + per-serving, rounding), `mealTotals`/`dayTotals` (multi-item, food + recipe mix).
- Food + recipe CRUD + tagging; recipe allergen/diet union.
- Meal-plan lifecycle: create → add days (default slots seeded) → add food + recipe items → day totals correct → set targets → finalise; `saveAsTemplate` + `applyTemplate` deep-copy the tree; `listMealPlansForPatient`.
- Flagging: patient allergic to egg + a plan containing an egg-tagged food → allergen warning; diet-tagged food not matching patient diet → diet warning; untagged food → no diet warning.
- GDPR: `deletePatient` removes the patient's meal plans (not templates/foods/recipes); `gdpr-export` includes them.
- PDF renders to a `%PDF` buffer; email is mock-safe.
- Browser smoke (mock mode): seed 2–3 foods + 1 recipe → build a 1-day plan with a food item + a recipe item → per-day totals vs targets show → add an allergen-tagged food for an allergic patient → warning appears → finalise → download PDF → email (mock) → save as template → apply to another patient.

## Decomposition into implementation plans

- **3c-1 — food database:** `foods` + `food_tags` + `lib/foods.ts` (incl. pure `foodNutrition`) + `/admin/foods` UI + tests.
- **3c-2 — recipes:** `recipes` + `recipe_items` + `lib/recipes.ts` (nutrition + allergen/diet union) + `/recipes` builder + tests.
- **3c-3 — meal-plan engine:** `meal_plans` + days + meals + items + targets + `lib/meal-plans.ts` (CRUD, pure totals, warnings, templates save/apply) + tests.
- **3c-4 — builder UI:** `/meal-plans` list + `/meal-plans/new` + `/meal-plans/[id]` grid (live totals vs targets + warnings panel) + `/meal-plans/templates` + patient-page Meal plans card + nav link.
- **3c-5 — PDF + email + GDPR:** `lib/meal-plan-pdf.tsx` + download route + `sendMealPlanEmail` + extend `deletePatient` + `gdpr-export` + browser smoke.

## Explicit non-goals (YAGNI)

External nutrient database / API import; barcode scanning; micronutrients (vitamins/minerals) beyond the label panel; auto-generated or AI-generated plans; grams-based household-measure tables (the per-portion model replaces this); patient-portal meal-plan view / patient food logging / adherence tracking; shopping-list generation. Each is a candidate later slice.
