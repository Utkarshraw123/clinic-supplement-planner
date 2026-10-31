# Phase 3c-2 — Recipes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Recipes composed of foods (each a portion count) with a servings yield, per-serving nutrition auto-computed, allergen/diet tags inherited from ingredients, and a `/recipes` builder.

**Architecture:** `recipes` + `recipe_items` tables (already in `schema.sql` from 3c-1's schema commit). `lib/recipes.ts` reuses `foodNutrition` for a pure `recipeNutrition` (whole + per-serving) and derives `recipeTagIds` (union of ingredient food tags). `/recipes` list + `/recipes/[id]` builder with a client editor mirroring `InvoiceItemsEditor`.

**Tech Stack:** Next.js 14, `@libsql/client`, `vitest`.

## Global Constraints

- Depends on 3c-1 (`lib/foods.ts`, `foodNutrition`, schema).
- Recipes are archived, never hard-deleted. Keep `npm test` green, `tsc` clean. Co-Authored-By trailer on commits.

---

### Task 1: `lib/recipes.ts` + tests

**Files:** Create `lib/recipes.ts`, `test/recipes.test.ts`.

**Interfaces — Produces:**
- `type RecipeRow`, `type RecipeItemRow`, `type RecipeItemResolved = RecipeItemRow & { food: FoodRow }`
- `recipeNutrition(items: { food: FoodPanel; portions: number }[], servings: number): { whole: FoodPanel; perServing: FoodPanel }` (pure)
- `createRecipe(name, servings, method, createdBy?)`, `updateRecipe(id, name, servings, method)`, `archiveRecipe(id)`, `listRecipes(includeArchived?)`, `getRecipe(id)→{recipe, items}`, `setRecipeItems(recipeId, items)`, `recipeTagIds(recipeId)`

- [ ] **Step 1: failing test** `test/recipes.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createFood, setFoodTags } from "@/lib/foods";
import { createRecipe, getRecipe, setRecipeItems, recipeNutrition, recipeTagIds, listRecipes } from "@/lib/recipes";

const p = (kcal: number) => ({ energy_kcal: kcal, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 });

describe("recipes", () => {
  beforeAll(async () => { await runMigrations(); });

  it("computes whole + per-serving nutrition (pure)", () => {
    const r = recipeNutrition([{ food: p(100), portions: 2 }, { food: p(50), portions: 1 }], 5);
    expect(r.whole.energy_kcal).toBe(250);
    expect(r.perServing.energy_kcal).toBe(50);
  });

  it("builds a recipe, resolves items, unions ingredient tags", async () => {
    const egg = await addTerm("allergen", "egg");
    const f1 = await createFood({ name: "Eggs", portionLabel: "2 eggs", ...p(140) });
    await setFoodTags(f1, [egg]);
    const f2 = await createFood({ name: "Spinach", portionLabel: "1 handful", ...p(20) });
    const rid = await createRecipe("Omelette", 2, "Whisk and cook.");
    await setRecipeItems(rid, [{ foodId: f1, portions: 1 }, { foodId: f2, portions: 2 }]);
    const got = await getRecipe(rid);
    expect(got?.items).toHaveLength(2);
    expect(got?.recipe.servings).toBe(2);
    expect(await recipeTagIds(rid)).toContain(egg);
    expect((await listRecipes()).some((x) => x.id === rid)).toBe(true);
  });
});
```

- [ ] **Step 2: run (FAIL)** — `npx vitest run test/recipes.test.ts`

- [ ] **Step 3: create `lib/recipes.ts`**

```ts
import { query, execute } from "@/lib/db";
import { foodNutrition, type FoodPanel, type FoodRow } from "@/lib/foods";

export type RecipeRow = { id: number; name: string; servings: number; method: string | null; status: string; created_by: number | null; created_at: string };
export type RecipeItemRow = { id: number; recipe_id: number; food_id: number; portions: number; sort: number };
export type RecipeItemResolved = RecipeItemRow & { food: FoodRow };

const KEYS: (keyof FoodPanel)[] = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"];
const zero = (): FoodPanel => ({ energy_kcal: 0, protein_g: 0, carbs_g: 0, sugars_g: 0, fat_g: 0, saturates_g: 0, fibre_g: 0, salt_g: 0 });

export function recipeNutrition(items: { food: FoodPanel; portions: number }[], servings: number): { whole: FoodPanel; perServing: FoodPanel } {
  const whole = items.reduce((acc, it) => { const n = foodNutrition(it.food, it.portions); KEYS.forEach((k) => (acc[k] += n[k])); return acc; }, zero());
  const s = servings > 0 ? servings : 1;
  const perServing = zero();
  KEYS.forEach((k) => (perServing[k] = whole[k] / s));
  return { whole, perServing };
}

export async function createRecipe(name: string, servings: number, method: string | null, createdBy?: number): Promise<number> {
  const rs = await execute("INSERT INTO recipes (name, servings, method, created_by) VALUES (?, ?, ?, ?)", [name.trim(), Math.max(1, servings || 1), (method || "").trim() || null, createdBy ?? null]);
  return Number(rs.lastInsertRowid);
}
export async function updateRecipe(id: number, name: string, servings: number, method: string | null): Promise<void> {
  await execute("UPDATE recipes SET name=?, servings=?, method=? WHERE id=?", [name.trim(), Math.max(1, servings || 1), (method || "").trim() || null, id]);
}
export async function archiveRecipe(id: number): Promise<void> { await execute("UPDATE recipes SET status='archived' WHERE id=?", [id]); }
export async function listRecipes(includeArchived = false): Promise<RecipeRow[]> {
  return includeArchived ? query<RecipeRow>("SELECT * FROM recipes ORDER BY name") : query<RecipeRow>("SELECT * FROM recipes WHERE status='active' ORDER BY name");
}
export async function getRecipe(id: number): Promise<{ recipe: RecipeRow; items: RecipeItemResolved[] } | null> {
  const recipe = (await query<RecipeRow>("SELECT * FROM recipes WHERE id=?", [id]))[0];
  if (!recipe) return null;
  const rows = await query<RecipeItemRow>("SELECT * FROM recipe_items WHERE recipe_id=? ORDER BY sort, id", [id]);
  const items: RecipeItemResolved[] = [];
  for (const r of rows) { const food = (await query<FoodRow>("SELECT * FROM foods WHERE id=?", [r.food_id]))[0]; if (food) items.push({ ...r, food }); }
  return { recipe, items };
}
export async function setRecipeItems(recipeId: number, items: { foodId: number; portions: number }[]): Promise<void> {
  await execute("DELETE FROM recipe_items WHERE recipe_id=?", [recipeId]);
  let sort = 0;
  for (const it of items) await execute("INSERT INTO recipe_items (recipe_id, food_id, portions, sort) VALUES (?, ?, ?, ?)", [recipeId, it.foodId, it.portions, sort++]);
}
export async function recipeTagIds(recipeId: number): Promise<number[]> {
  const rows = await query<{ taxonomy_term_id: number }>(
    "SELECT DISTINCT ft.taxonomy_term_id FROM recipe_items ri JOIN food_tags ft ON ft.food_id = ri.food_id WHERE ri.recipe_id = ?",
    [recipeId],
  );
  return rows.map((r) => r.taxonomy_term_id);
}
```

- [ ] **Step 4: run + commit**

```bash
npx vitest run test/recipes.test.ts
git add lib/recipes.ts test/recipes.test.ts
git commit -m "feat(3c): recipes lib (per-serving nutrition, ingredient tag union)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Recipe builder UI

**Files:** Create `components/RecipeItemsEditor.tsx`, `app/recipes/page.tsx`, `app/recipes/actions.ts`, `app/recipes/[id]/page.tsx`; modify `components/AppShell.tsx`.

- [ ] **Step 1: `components/RecipeItemsEditor.tsx`** (client; rows of food × portions, live whole + per-serving panel, hidden JSON `items`)

```tsx
"use client";
import { useMemo, useState } from "react";

type FoodOpt = { id: number; name: string; portion_label: string; energy_kcal: number; protein_g: number; carbs_g: number; sugars_g: number; fat_g: number; saturates_g: number; fibre_g: number; salt_g: number };
type Row = { foodId: number; portions: number };
const KEYS = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"] as const;

export default function RecipeItemsEditor({ foods, initialItems = [], servings = 1 }: { foods: FoodOpt[]; initialItems?: Row[]; servings?: number }) {
  const [rows, setRows] = useState<Row[]>(initialItems);
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const whole = KEYS.reduce((acc, k) => { acc[k] = rows.reduce((s, r) => { const f = byId.get(r.foodId); return s + (f ? f[k] * (r.portions || 0) : 0); }, 0); return acc; }, {} as Record<string, number>);
  const s = servings > 0 ? servings : 1;
  const itemsJson = useMemo(() => JSON.stringify(rows.filter((r) => r.foodId > 0)), [rows]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="items" value={itemsJson} />
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: "center" }}>
          <select style={{ flex: 1 }} value={r.foodId} onChange={(e) => update(i, { foodId: Number(e.target.value) })}>
            <option value={0}>Choose a food…</option>
            {foods.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.portion_label})</option>)}
          </select>
          <input style={{ width: 80 }} type="number" step="0.25" min="0" value={r.portions} onChange={(e) => update(i, { portions: Number(e.target.value) })} />
          <span className="muted-xs">portions</span>
          <button type="button" className="btn" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { foodId: 0, portions: 1 }])}>+ Add ingredient</button>
      <p className="muted-xs">Per serving: {Math.round(whole.energy_kcal / s)} kcal · P {(whole.protein_g / s).toFixed(1)} · C {(whole.carbs_g / s).toFixed(1)} · F {(whole.fat_g / s).toFixed(1)} · fibre {(whole.fibre_g / s).toFixed(1)} · salt {(whole.salt_g / s).toFixed(2)} g</p>
    </div>
  );
}
```

- [ ] **Step 2: `app/recipes/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createRecipe, updateRecipe, setRecipeItems, archiveRecipe } from "@/lib/recipes";

function parseItems(raw: string): { foodId: number; portions: number }[] {
  try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? a.map((r) => ({ foodId: Number(r.foodId), portions: Number(r.portions) || 0 })).filter((r) => r.foodId > 0) : []; } catch { return []; }
}

export async function createRecipeAction(fd: FormData) {
  const u = await requireUser();
  const id = await createRecipe(String(fd.get("name") || ""), Number(fd.get("servings") || 1), String(fd.get("method") || ""), u.userId);
  redirect(`/recipes/${id}`);
}
export async function saveRecipeAction(id: number, fd: FormData) {
  await requireUser();
  await updateRecipe(id, String(fd.get("name") || ""), Number(fd.get("servings") || 1), String(fd.get("method") || ""));
  await setRecipeItems(id, parseItems(String(fd.get("items") || "[]")));
  revalidatePath(`/recipes/${id}`);
}
export async function archiveRecipeAction(id: number, _fd?: FormData) {
  await requireUser();
  await archiveRecipe(id);
  redirect("/recipes");
}
```

- [ ] **Step 3: `app/recipes/page.tsx`**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listRecipes } from "@/lib/recipes";
import { createRecipeAction } from "./actions";

export default async function RecipesPage() {
  await requireUser();
  const recipes = await listRecipes();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between"><h1>Recipes</h1></div>
      <div className="card">
        <form action={createRecipeAction} className="row" style={{ gap: 8 }}>
          <input name="name" placeholder="New recipe name" required style={{ flex: 1 }} />
          <input name="servings" type="number" min="1" defaultValue={1} style={{ width: 90 }} title="Servings" />
          <input type="hidden" name="method" value="" />
          <button type="submit" className="btn--primary">Create</button>
        </form>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {recipes.length === 0 ? <p className="muted">No recipes yet.</p> : recipes.map((r) => (
          <Link key={r.id} href={`/recipes/${r.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{r.name}</span><span className="muted">{r.servings} serving{r.servings === 1 ? "" : "s"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `app/recipes/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getRecipe } from "@/lib/recipes";
import { listFoods } from "@/lib/foods";
import RecipeItemsEditor from "@/components/RecipeItemsEditor";
import { saveRecipeAction, archiveRecipeAction } from "../actions";

export default async function RecipeDetail({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const got = await getRecipe(id);
  if (!got) notFound();
  const foods = await listFoods();
  const initial = got.items.map((it) => ({ foodId: it.food_id, portions: it.portions }));
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      <h1>{got.recipe.name}</h1>
      <form action={saveRecipeAction.bind(null, id)} className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <label className="stack" style={{ gap: 4, flex: 2 }}><span>Name</span><input name="name" defaultValue={got.recipe.name} required /></label>
          <label className="stack" style={{ gap: 4, width: 110 }}><span>Servings</span><input name="servings" type="number" min="1" defaultValue={got.recipe.servings} /></label>
        </div>
        <RecipeItemsEditor foods={foods} initialItems={initial} servings={got.recipe.servings} />
        <label className="stack" style={{ gap: 4 }}><span>Method</span><textarea name="method" rows={4} defaultValue={got.recipe.method ?? ""} /></label>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save recipe</button>
      </form>
      <form action={archiveRecipeAction.bind(null, id)}><button className="btn--sm">Archive recipe</button></form>
    </div>
  );
}
```

- [ ] **Step 5: nav link** — in `components/AppShell.tsx`, after the `{ href: "/invoices", ... }` line add `{ href: "/recipes", label: "Recipes", icon: "layers" },`.

- [ ] **Step 6: typecheck + commit**

```bash
npx tsc --noEmit
git add components/RecipeItemsEditor.tsx "app/recipes/page.tsx" "app/recipes/actions.ts" "app/recipes/[id]/page.tsx" components/AppShell.tsx
git commit -m "feat(3c): recipe builder UI (ingredients x portions, live per-serving nutrition)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- Spec coverage: recipes tables (from 3c-1 schema) + per-serving nutrition + tag union + builder ✓.
- Types: `recipeNutrition` consumes `FoodPanel`; `RecipeItemsEditor` food opt shape matches `listFoods` rows; `saveRecipeAction.bind(null, id)` matches `(id, fd)`.
