# Phase 3c-3 — Meal-Plan Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The meal-plan domain — plan/day/meal/item CRUD, a resolved tree with computed per-item/meal/day nutrition, per-day targets, allergen/diet warnings, finalise, and template save/apply — all in `lib/meal-plans.ts`. No UI.

**Architecture:** Tables already in `schema.sql`. `getMealPlan(id)` returns a fully-resolved `PlanTree` with nutrition summed from `foodNutrition` (3c-1) and recipe per-serving (3c-2). `planWarnings` reuses the patient's `allergy`/`diet` attributes vs food/recipe tags + the taxonomy type map. Templates reuse the same structure via `is_template`/nullable `patient_id` + a deep-copy helper (mirrors `savePlanAsProtocol`/`applyProtocolToPlan`).

**Tech Stack:** Next.js 14, `@libsql/client`, `vitest`.

## Global Constraints

- Depends on 3c-1 (`lib/foods.ts`) + 3c-2 (`lib/recipes.ts`).
- Nutrition computed on read, never stored. A new day seeds default meals: Breakfast / Morning snack / Lunch / Afternoon snack / Dinner.
- Flagging warns (never blocks). Audit `meal_plan_created`/`meal_plan_finalised` PII-free. Keep tests green, tsc clean, Co-Authored-By trailer.

---

### Task 1: `lib/meal-plans.ts` + tests

**Files:** Create `lib/meal-plans.ts`, `test/meal-plans.test.ts`.

**Interfaces — Produces:** `MealPlanRow`, `PlanItem`, `PlanMeal`, `PlanDay`, `PlanTree`, `MealPlanInput`, `PlanWarning`; pure `sumPanels`; `createMealPlan`, `updatePlanMeta`, `addDay`, `removeDay`, `addMeal`, `renameMeal`, `removeMeal`, `addItem`, `updateItem`, `removeItem`, `getMealPlan`, `finaliseMealPlan`, `listMealPlansForPatient`, `listTemplates`, `saveAsTemplate`, `applyTemplate`, `planWarnings`.

- [ ] **Step 1: failing test** `test/meal-plans.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes } from "@/lib/patients";
import { createFood, setFoodTags } from "@/lib/foods";
import { createRecipe, setRecipeItems } from "@/lib/recipes";
import {
  createMealPlan, addDay, addItem, getMealPlan, finaliseMealPlan,
  saveAsTemplate, applyTemplate, listTemplates, listMealPlansForPatient, planWarnings,
} from "@/lib/meal-plans";

const p = (kcal: number) => ({ energy_kcal: kcal, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 });

describe("meal plans", () => {
  beforeAll(async () => { await runMigrations(); });

  it("builds a day (seeds meals), sums nutrition, finalises, templates round-trip", async () => {
    const pid = await createPatient({ name: "Meal P", dob: "1990-01-01" });
    const f = await createFood({ name: "Oats", portionLabel: "1 bowl", ...p(200) });
    const rf = await createFood({ name: "Berries", portionLabel: "1 handful", ...p(40) });
    const rid = await createRecipe("Berry bowl", 2, null);
    await setRecipeItems(rid, [{ foodId: rf, portions: 2 }]); // whole 80, per serving 40

    const planId = await createMealPlan(pid, { title: "Week 1", targetKcal: 500 }, 1);
    const dayId = await addDay(planId);
    const tree0 = await getMealPlan(planId);
    const breakfast = tree0!.days[0].meals.find((m) => m.name === "Breakfast")!;
    expect(tree0!.days[0].meals).toHaveLength(5);

    await addItem(breakfast.id, { itemType: "food", foodId: f, quantity: 1 });        // 200
    await addItem(breakfast.id, { itemType: "recipe", recipeId: rid, quantity: 2 });   // 40*2 = 80
    const tree = await getMealPlan(planId);
    const bf = tree!.days[0].meals.find((m) => m.name === "Breakfast")!;
    expect(bf.totals.energy_kcal).toBe(280);
    expect(tree!.days[0].totals.energy_kcal).toBe(280);

    await finaliseMealPlan(planId, 1);
    expect((await getMealPlan(planId))!.plan.status).toBe("final");

    const tplId = await saveAsTemplate(planId, "Week 1 template", 1);
    expect((await listTemplates()).some((t) => t.id === tplId)).toBe(true);
    const pid2 = await createPatient({ name: "Meal P2", dob: "1990-01-01" });
    const applied = await applyTemplate(tplId, pid2, 1);
    const at = await getMealPlan(applied);
    expect(at!.plan.patient_id).toBe(pid2);
    expect(at!.days[0].meals.find((m) => m.name === "Breakfast")!.totals.energy_kcal).toBe(280);
    expect((await listMealPlansForPatient(pid2)).some((m) => m.id === applied)).toBe(true);
  });

  it("warns on allergen + diet conflicts (never blocks)", async () => {
    const egg = await addTerm("allergen", "egg");
    const vegan = await addTerm("diet", "Vegan");
    const pid = await createPatient({ name: "Allergic P", dob: "1990-01-01" });
    await setPatientAttributes(pid, "allergy", [egg]);
    await setPatientAttributes(pid, "diet", [vegan]);

    const eggy = await createFood({ name: "Eggs", portionLabel: "2 eggs", ...p(140) });
    await setFoodTags(eggy, [egg]); // contains egg, and no diet tag
    const planId = await createMealPlan(pid, { title: "W" }, 1);
    const dayId = await addDay(planId);
    const tree = await getMealPlan(planId);
    await addItem(tree!.days[0].meals[0].id, { itemType: "food", foodId: eggy, quantity: 1 });

    const w = await planWarnings(planId, pid);
    expect(w.some((x) => x.message.includes("contains egg"))).toBe(true);
  });
});
```

- [ ] **Step 2: run (FAIL)** — `npx vitest run test/meal-plans.test.ts`

> Note: the test uses `setPatientAttributes(pid, attrType, termIds)`. Confirm the exact name in `lib/patients.ts` first; if it differs (e.g. `setAttributes`/`setPatientAttrs`), adjust the import and the two calls to match. It is the function the clinical-profile form uses to persist a patient's allergy/diet term ids.

- [ ] **Step 3: create `lib/meal-plans.ts`**

```ts
import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { foodNutrition, listFoods, type FoodPanel } from "@/lib/foods";
import { getRecipe, recipeNutrition } from "@/lib/recipes";
import { getPatient } from "@/lib/patients";
import { listTerms } from "@/lib/taxonomies";

export const PANEL_KEYS: (keyof FoodPanel)[] = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"];
const zero = (): FoodPanel => ({ energy_kcal: 0, protein_g: 0, carbs_g: 0, sugars_g: 0, fat_g: 0, saturates_g: 0, fibre_g: 0, salt_g: 0 });
export function sumPanels(panels: FoodPanel[]): FoodPanel { const out = zero(); for (const p of panels) PANEL_KEYS.forEach((k) => (out[k] += p[k])); return out; }

export type MealPlanRow = {
  id: number; patient_id: number | null; is_template: number; title: string | null; start_date: string | null; notes: string | null;
  target_kcal: number | null; target_protein_g: number | null; target_carbs_g: number | null; target_fat_g: number | null; target_fibre_g: number | null; target_salt_g: number | null;
  status: "draft" | "final"; created_by: number | null; created_at: string; updated_at: string;
};
export type PlanItem = { id: number; meal_id: number; item_type: "food" | "recipe"; food_id: number | null; recipe_id: number | null; quantity: number; note: string | null; sort: number; label: string; nutrition: FoodPanel };
export type PlanMeal = { id: number; day_id: number; name: string; sort: number; items: PlanItem[]; totals: FoodPanel };
export type PlanDay = { id: number; meal_plan_id: number; day_index: number; label: string | null; sort: number; meals: PlanMeal[]; totals: FoodPanel };
export type PlanTree = { plan: MealPlanRow; days: PlanDay[] };
export type MealPlanInput = { title?: string; startDate?: string; notes?: string; targetKcal?: number | null; targetProtein?: number | null; targetCarbs?: number | null; targetFat?: number | null; targetFibre?: number | null; targetSalt?: number | null };

const DEFAULT_MEALS = ["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner"];

export async function createMealPlan(patientId: number | null, input: MealPlanInput, createdBy?: number, isTemplate = false): Promise<number> {
  const rs = await execute(
    `INSERT INTO meal_plans (patient_id, is_template, title, start_date, notes, target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_fibre_g, target_salt_g, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, isTemplate ? 1 : 0, (input.title || "").trim() || null, (input.startDate || "").trim() || null, (input.notes || "").trim() || null,
      input.targetKcal ?? null, input.targetProtein ?? null, input.targetCarbs ?? null, input.targetFat ?? null, input.targetFibre ?? null, input.targetSalt ?? null, createdBy ?? null],
  );
  const id = Number(rs.lastInsertRowid);
  if (patientId && !isTemplate) await recordAudit({ actorId: createdBy, action: "meal_plan_created", entity: "patient", entityId: patientId, detail: `meal plan ${id}` });
  return id;
}

export async function updatePlanMeta(id: number, input: MealPlanInput): Promise<void> {
  await execute(
    `UPDATE meal_plans SET title=?, start_date=?, notes=?, target_kcal=?, target_protein_g=?, target_carbs_g=?, target_fat_g=?, target_fibre_g=?, target_salt_g=?, updated_at=datetime('now') WHERE id=?`,
    [(input.title || "").trim() || null, (input.startDate || "").trim() || null, (input.notes || "").trim() || null,
      input.targetKcal ?? null, input.targetProtein ?? null, input.targetCarbs ?? null, input.targetFat ?? null, input.targetFibre ?? null, input.targetSalt ?? null, id],
  );
}

export async function addDay(planId: number, label?: string): Promise<number> {
  const existing = await query<{ n: number }>("SELECT COUNT(*) AS n FROM meal_plan_days WHERE meal_plan_id=?", [planId]);
  const idx = Number(existing[0]?.n ?? 0) + 1;
  const rs = await execute("INSERT INTO meal_plan_days (meal_plan_id, day_index, label, sort) VALUES (?, ?, ?, ?)", [planId, idx, label || `Day ${idx}`, idx]);
  const dayId = Number(rs.lastInsertRowid);
  let sort = 0;
  for (const name of DEFAULT_MEALS) await execute("INSERT INTO meal_plan_meals (day_id, name, sort) VALUES (?, ?, ?)", [dayId, name, sort++]);
  return dayId;
}
export async function removeDay(dayId: number): Promise<void> { await execute("DELETE FROM meal_plan_days WHERE id=?", [dayId]); }
export async function addMeal(dayId: number, name: string): Promise<number> {
  const s = await query<{ n: number }>("SELECT COUNT(*) AS n FROM meal_plan_meals WHERE day_id=?", [dayId]);
  const rs = await execute("INSERT INTO meal_plan_meals (day_id, name, sort) VALUES (?, ?, ?)", [dayId, name.trim() || "Meal", Number(s[0]?.n ?? 0)]);
  return Number(rs.lastInsertRowid);
}
export async function renameMeal(mealId: number, name: string): Promise<void> { await execute("UPDATE meal_plan_meals SET name=? WHERE id=?", [name.trim() || "Meal", mealId]); }
export async function removeMeal(mealId: number): Promise<void> { await execute("DELETE FROM meal_plan_meals WHERE id=?", [mealId]); }

export async function addItem(mealId: number, input: { itemType: "food" | "recipe"; foodId?: number; recipeId?: number; quantity: number; note?: string }): Promise<number> {
  const s = await query<{ n: number }>("SELECT COUNT(*) AS n FROM meal_plan_items WHERE meal_id=?", [mealId]);
  const rs = await execute(
    "INSERT INTO meal_plan_items (meal_id, item_type, food_id, recipe_id, quantity, note, sort) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [mealId, input.itemType, input.foodId ?? null, input.recipeId ?? null, input.quantity, (input.note || "").trim() || null, Number(s[0]?.n ?? 0)],
  );
  return Number(rs.lastInsertRowid);
}
export async function updateItem(itemId: number, quantity: number, note?: string): Promise<void> {
  await execute("UPDATE meal_plan_items SET quantity=?, note=? WHERE id=?", [quantity, (note || "").trim() || null, itemId]);
}
export async function removeItem(itemId: number): Promise<void> { await execute("DELETE FROM meal_plan_items WHERE id=?", [itemId]); }

async function recipePerServing(recipeId: number): Promise<{ panel: FoodPanel; name: string } | null> {
  const r = await getRecipe(recipeId);
  if (!r) return null;
  const { perServing } = recipeNutrition(r.items.map((it) => ({ food: it.food, portions: it.portions })), r.recipe.servings);
  return { panel: perServing, name: r.recipe.name };
}

export async function getMealPlan(id: number): Promise<PlanTree | null> {
  const plan = (await query<MealPlanRow>("SELECT * FROM meal_plans WHERE id=?", [id]))[0];
  if (!plan) return null;
  const foods = new Map((await listFoods(true)).map((f) => [f.id, f] as const));
  const dayRows = await query<{ id: number; meal_plan_id: number; day_index: number; label: string | null; sort: number }>("SELECT * FROM meal_plan_days WHERE meal_plan_id=? ORDER BY sort, id", [id]);
  const days: PlanDay[] = [];
  for (const d of dayRows) {
    const mealRows = await query<{ id: number; day_id: number; name: string; sort: number }>("SELECT * FROM meal_plan_meals WHERE day_id=? ORDER BY sort, id", [d.id]);
    const meals: PlanMeal[] = [];
    for (const m of mealRows) {
      const itemRows = await query<{ id: number; meal_id: number; item_type: "food" | "recipe"; food_id: number | null; recipe_id: number | null; quantity: number; note: string | null; sort: number }>("SELECT * FROM meal_plan_items WHERE meal_id=? ORDER BY sort, id", [m.id]);
      const items: PlanItem[] = [];
      for (const it of itemRows) {
        let label = "—"; let nutrition = zero();
        if (it.item_type === "food" && it.food_id) { const f = foods.get(it.food_id); if (f) { label = f.name; nutrition = foodNutrition(f, it.quantity); } }
        else if (it.item_type === "recipe" && it.recipe_id) { const rp = await recipePerServing(it.recipe_id); if (rp) { label = rp.name; nutrition = zero(); PANEL_KEYS.forEach((k) => (nutrition[k] = rp.panel[k] * it.quantity)); } }
        items.push({ ...it, label, nutrition });
      }
      meals.push({ ...m, items, totals: sumPanels(items.map((i) => i.nutrition)) });
    }
    days.push({ ...d, meals, totals: sumPanels(meals.map((mm) => mm.totals)) });
  }
  return { plan, days };
}

export async function finaliseMealPlan(id: number, actorId?: number): Promise<void> {
  const plan = (await query<{ patient_id: number | null }>("SELECT patient_id FROM meal_plans WHERE id=?", [id]))[0];
  await execute("UPDATE meal_plans SET status='final', updated_at=datetime('now') WHERE id=?", [id]);
  if (plan?.patient_id) await recordAudit({ actorId, action: "meal_plan_finalised", entity: "patient", entityId: plan.patient_id, detail: `meal plan ${id}` });
}

export async function listMealPlansForPatient(patientId: number): Promise<MealPlanRow[]> {
  return query<MealPlanRow>("SELECT * FROM meal_plans WHERE patient_id=? AND is_template=0 ORDER BY id DESC", [patientId]);
}
export async function listTemplates(): Promise<MealPlanRow[]> {
  return query<MealPlanRow>("SELECT * FROM meal_plans WHERE is_template=1 ORDER BY id DESC");
}

async function deepCopyInto(sourcePlanId: number, targetPlanId: number): Promise<void> {
  const days = await query<{ id: number; day_index: number; label: string | null; sort: number }>("SELECT * FROM meal_plan_days WHERE meal_plan_id=? ORDER BY sort, id", [sourcePlanId]);
  for (const d of days) {
    const rs = await execute("INSERT INTO meal_plan_days (meal_plan_id, day_index, label, sort) VALUES (?, ?, ?, ?)", [targetPlanId, d.day_index, d.label, d.sort]);
    const newDay = Number(rs.lastInsertRowid);
    const meals = await query<{ id: number; name: string; sort: number }>("SELECT * FROM meal_plan_meals WHERE day_id=? ORDER BY sort, id", [d.id]);
    for (const m of meals) {
      const mrs = await execute("INSERT INTO meal_plan_meals (day_id, name, sort) VALUES (?, ?, ?)", [newDay, m.name, m.sort]);
      const newMeal = Number(mrs.lastInsertRowid);
      const items = await query<{ item_type: string; food_id: number | null; recipe_id: number | null; quantity: number; note: string | null; sort: number }>("SELECT * FROM meal_plan_items WHERE meal_id=? ORDER BY sort, id", [m.id]);
      for (const it of items) await execute("INSERT INTO meal_plan_items (meal_id, item_type, food_id, recipe_id, quantity, note, sort) VALUES (?, ?, ?, ?, ?, ?, ?)", [newMeal, it.item_type, it.food_id, it.recipe_id, it.quantity, it.note, it.sort]);
    }
  }
}

export async function saveAsTemplate(planId: number, title: string, createdBy?: number): Promise<number> {
  const src = (await query<MealPlanRow>("SELECT * FROM meal_plans WHERE id=?", [planId]))[0];
  if (!src) throw new Error("plan not found");
  const tid = await createMealPlan(null, { title: title || src.title || "Template", notes: src.notes ?? undefined, targetKcal: src.target_kcal, targetProtein: src.target_protein_g, targetCarbs: src.target_carbs_g, targetFat: src.target_fat_g, targetFibre: src.target_fibre_g, targetSalt: src.target_salt_g }, createdBy, true);
  await deepCopyInto(planId, tid);
  return tid;
}

export async function applyTemplate(templateId: number, patientId: number, createdBy?: number): Promise<number> {
  const src = (await query<MealPlanRow>("SELECT * FROM meal_plans WHERE id=?", [templateId]))[0];
  if (!src) throw new Error("template not found");
  const pid = await createMealPlan(patientId, { title: src.title ?? "Meal plan", notes: src.notes ?? undefined, targetKcal: src.target_kcal, targetProtein: src.target_protein_g, targetCarbs: src.target_carbs_g, targetFat: src.target_fat_g, targetFibre: src.target_fibre_g, targetSalt: src.target_salt_g }, createdBy, false);
  await deepCopyInto(templateId, pid);
  return pid;
}

export type PlanWarning = { dayLabel: string; mealName: string; itemLabel: string; message: string };
export async function planWarnings(planId: number, patientId: number): Promise<PlanWarning[]> {
  const patient = await getPatient(patientId);
  if (!patient) return [];
  const allergyIds = new Set(patient.attributes.filter((a) => a.attrType === "allergy").map((a) => a.termId));
  const dietAttrs = patient.attributes.filter((a) => a.attrType === "diet");
  const dietIds = new Set(dietAttrs.map((a) => a.termId));
  const dietLabel = dietAttrs.map((a) => a.label).join(", ");
  if (allergyIds.size === 0 && dietIds.size === 0) return [];

  const terms = await listTerms();
  const termType = new Map(terms.map((t) => [t.id, t.type] as const));
  const termLabel = new Map(terms.map((t) => [t.id, t.label] as const));

  const tree = await getMealPlan(planId);
  if (!tree) return [];
  const warnings: PlanWarning[] = [];
  for (const d of tree.days) for (const m of d.meals) for (const it of m.items) {
    let tagIds: number[] = [];
    if (it.item_type === "food" && it.food_id) tagIds = (await query<{ taxonomy_term_id: number }>("SELECT taxonomy_term_id FROM food_tags WHERE food_id=?", [it.food_id])).map((r) => r.taxonomy_term_id);
    else if (it.item_type === "recipe" && it.recipe_id) tagIds = (await query<{ taxonomy_term_id: number }>("SELECT DISTINCT ft.taxonomy_term_id FROM recipe_items ri JOIN food_tags ft ON ft.food_id=ri.food_id WHERE ri.recipe_id=?", [it.recipe_id])).map((r) => r.taxonomy_term_id);
    const allergenTags = tagIds.filter((t) => termType.get(t) === "allergen");
    const dietTags = tagIds.filter((t) => termType.get(t) === "diet");
    const dl = d.label || `Day ${d.day_index}`;
    for (const a of allergenTags) if (allergyIds.has(a)) warnings.push({ dayLabel: dl, mealName: m.name, itemLabel: it.label, message: `contains ${termLabel.get(a) ?? "an allergen"}` });
    if (dietIds.size > 0 && dietTags.length > 0 && !dietTags.some((t) => dietIds.has(t))) warnings.push({ dayLabel: dl, mealName: m.name, itemLabel: it.label, message: `may not suit ${dietLabel}` });
  }
  return warnings;
}
```

- [ ] **Step 4: run + full suite + commit**

```bash
npx vitest run test/meal-plans.test.ts
rm -f test.db && npm test
npx tsc --noEmit
git add lib/meal-plans.ts test/meal-plans.test.ts
git commit -m "feat(3c): meal-plan engine (tree + nutrition totals, targets, templates, warnings)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- Spec coverage: plan/day/meal/item CRUD, computed tree nutrition, targets stored, finalise, templates deep-copy, allergen+diet warnings ✓.
- Types: `PlanTree`/`PlanDay`/`PlanMeal`/`PlanItem` used by the 3c-4 builder + 3c-5 PDF; `sumPanels` pure.
- Known risk: `setPatientAttributes` name — verify in `lib/patients.ts` before running the test (Step 2 note).
