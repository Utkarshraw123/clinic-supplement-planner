# Phase 3c-1 — Food Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A practitioner-maintained food database — each food carries the full label panel per one portion plus allergen/diet tags — with a pure nutrition-scaling helper and an `/admin/foods` UI.

**Architecture:** `foods` + `food_tags` tables (tags reuse `taxonomy_terms`). `lib/foods.ts` holds CRUD, tagging, and a pure `foodNutrition(panel, portions)`. `/admin/foods` is a list + add/edit form mirroring the existing admin pages.

**Tech Stack:** Next.js 14, `@libsql/client`, `vitest`.

## Global Constraints

- Panel values (`energy_kcal, protein_g, carbs_g, sugars_g, fat_g, saturates_g, fibre_g, salt_g`) are **per one portion** (`portion_label`); REAL.
- Foods are **archived, never hard-deleted** (meal plans reference them).
- Never put `;` in a SQL comment. Run `npm run migrate:all` after schema edits.
- Keep `npm test` green and `npx tsc --noEmit` clean; end commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema

**Files:** Modify `lib/schema.sql`.

- [ ] **Step 1: Append to `lib/schema.sql`**

```sql
-- Phase 3c meal planner. Practitioner-maintained food database. Panel is per one portion.
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  portion_label TEXT NOT NULL DEFAULT '1 portion',
  energy_kcal REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  sugars_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  saturates_g REAL NOT NULL DEFAULT 0,
  fibre_g REAL NOT NULL DEFAULT 0,
  salt_g REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id INTEGER REFERENCES foods(id) ON DELETE CASCADE,
  taxonomy_term_id INTEGER REFERENCES taxonomy_terms(id)
);
```

- [ ] **Step 2: Migrate + commit**

```bash
npm run migrate:all
git add lib/schema.sql
git commit -m "feat(3c): foods + food_tags tables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `lib/foods.ts` + tests

**Files:** Create `lib/foods.ts`, `test/foods.test.ts`.

**Interfaces — Produces:**
- `type FoodPanel = { energy_kcal; protein_g; carbs_g; sugars_g; fat_g; saturates_g; fibre_g; salt_g }` (all `number`)
- `type FoodRow = FoodPanel & { id; name; portion_label; status; created_by; created_at }`
- `type FoodInput = FoodPanel & { name: string; portionLabel: string }`
- `foodNutrition(panel: FoodPanel, portions: number): FoodPanel` (pure)
- `createFood(input, createdBy?)`, `updateFood(id, input)`, `getFood(id)`, `listFoods(includeArchived?)`, `archiveFood(id)`, `setFoodTags(foodId, termIds)`, `listFoodTagIds(foodId)`

- [ ] **Step 1: Write the failing test**

```ts
// test/foods.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createFood, getFood, listFoods, archiveFood, updateFood, setFoodTags, listFoodTagIds, foodNutrition } from "@/lib/foods";

const panel = { energy_kcal: 100, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 };

describe("foods", () => {
  beforeAll(async () => { await runMigrations(); });

  it("scales nutrition by portions (pure)", () => {
    const n = foodNutrition(panel, 2);
    expect(n.energy_kcal).toBe(200);
    expect(n.protein_g).toBe(20);
    expect(n.salt_g).toBeCloseTo(0.4);
    expect(foodNutrition(panel, 0.5).energy_kcal).toBe(50);
  });

  it("creates, reads, tags, lists, archives", async () => {
    const egg = await addTerm("allergen", "egg");
    const id = await createFood({ name: "Scrambled eggs", portionLabel: "2 eggs", ...panel });
    await setFoodTags(id, [egg]);
    const f = await getFood(id);
    expect(f?.name).toBe("Scrambled eggs");
    expect(f?.energy_kcal).toBe(100);
    expect(await listFoodTagIds(id)).toEqual([egg]);
    expect((await listFoods()).some((x) => x.id === id)).toBe(true);

    await updateFood(id, { name: "Scrambled eggs (2)", portionLabel: "2 eggs", ...panel, energy_kcal: 160 });
    expect((await getFood(id))?.energy_kcal).toBe(160);

    await archiveFood(id);
    expect((await listFoods()).some((x) => x.id === id)).toBe(false);
    expect((await listFoods(true)).some((x) => x.id === id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/foods.test.ts` (FAIL: module missing).

- [ ] **Step 3: Create `lib/foods.ts`**

```ts
import { query, execute } from "@/lib/db";

export type FoodPanel = {
  energy_kcal: number; protein_g: number; carbs_g: number; sugars_g: number;
  fat_g: number; saturates_g: number; fibre_g: number; salt_g: number;
};
export type FoodRow = FoodPanel & { id: number; name: string; portion_label: string; status: string; created_by: number | null; created_at: string };
export type FoodInput = FoodPanel & { name: string; portionLabel: string };

export const PANEL_COLS: (keyof FoodPanel)[] = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"];

export function foodNutrition(panel: FoodPanel, portions: number): FoodPanel {
  const out = {} as FoodPanel;
  for (const c of PANEL_COLS) out[c] = (panel[c] || 0) * portions;
  return out;
}

export async function createFood(input: FoodInput, createdBy?: number): Promise<number> {
  const rs = await execute(
    `INSERT INTO foods (name, portion_label, energy_kcal, protein_g, carbs_g, sugars_g, fat_g, saturates_g, fibre_g, salt_g, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.name.trim(), input.portionLabel.trim(), input.energy_kcal, input.protein_g, input.carbs_g, input.sugars_g, input.fat_g, input.saturates_g, input.fibre_g, input.salt_g, createdBy ?? null],
  );
  return Number(rs.lastInsertRowid);
}

export async function updateFood(id: number, input: FoodInput): Promise<void> {
  await execute(
    `UPDATE foods SET name=?, portion_label=?, energy_kcal=?, protein_g=?, carbs_g=?, sugars_g=?, fat_g=?, saturates_g=?, fibre_g=?, salt_g=? WHERE id=?`,
    [input.name.trim(), input.portionLabel.trim(), input.energy_kcal, input.protein_g, input.carbs_g, input.sugars_g, input.fat_g, input.saturates_g, input.fibre_g, input.salt_g, id],
  );
}

export async function getFood(id: number): Promise<FoodRow | null> {
  return (await query<FoodRow>("SELECT * FROM foods WHERE id = ?", [id]))[0] ?? null;
}

export async function listFoods(includeArchived = false): Promise<FoodRow[]> {
  return includeArchived
    ? query<FoodRow>("SELECT * FROM foods ORDER BY name")
    : query<FoodRow>("SELECT * FROM foods WHERE status = 'active' ORDER BY name");
}

export async function archiveFood(id: number): Promise<void> {
  await execute("UPDATE foods SET status = 'archived' WHERE id = ?", [id]);
}

export async function setFoodTags(foodId: number, termIds: number[]): Promise<void> {
  await execute("DELETE FROM food_tags WHERE food_id = ?", [foodId]);
  for (const t of termIds) await execute("INSERT INTO food_tags (food_id, taxonomy_term_id) VALUES (?, ?)", [foodId, t]);
}

export async function listFoodTagIds(foodId: number): Promise<number[]> {
  return (await query<{ taxonomy_term_id: number }>("SELECT taxonomy_term_id FROM food_tags WHERE food_id = ?", [foodId])).map((r) => r.taxonomy_term_id);
}
```

- [ ] **Step 4: Run test + commit**

```bash
npx vitest run test/foods.test.ts
git add lib/foods.ts test/foods.test.ts
git commit -m "feat(3c): food database lib (panel per portion, tags, pure foodNutrition)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `/admin/foods` UI

**Files:** Create `app/admin/foods/page.tsx`, `app/admin/foods/actions.ts`; modify `components/AppShell.tsx` (nav link under the admin group).

- [ ] **Step 1: Create `app/admin/foods/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createFood, updateFood, archiveFood, setFoodTags, type FoodInput } from "@/lib/foods";

function panelFrom(fd: FormData): FoodInput {
  const n = (k: string) => Number(fd.get(k) || 0);
  return {
    name: String(fd.get("name") || ""),
    portionLabel: String(fd.get("portion_label") || "1 portion"),
    energy_kcal: n("energy_kcal"), protein_g: n("protein_g"), carbs_g: n("carbs_g"), sugars_g: n("sugars_g"),
    fat_g: n("fat_g"), saturates_g: n("saturates_g"), fibre_g: n("fibre_g"), salt_g: n("salt_g"),
  };
}
function tagIds(fd: FormData): number[] {
  return fd.getAll("tag").map((v) => Number(v)).filter((n) => n > 0);
}

export async function addFoodAction(fd: FormData) {
  const u = await requireAdmin();
  const id = await createFood(panelFrom(fd), u.userId);
  await setFoodTags(id, tagIds(fd));
  revalidatePath("/admin/foods");
}

export async function updateFoodAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await updateFood(id, panelFrom(fd));
  await setFoodTags(id, tagIds(fd));
  revalidatePath("/admin/foods");
}

export async function archiveFoodAction(fd: FormData) {
  await requireAdmin();
  await archiveFood(Number(fd.get("id")));
  revalidatePath("/admin/foods");
}
```

- [ ] **Step 2: Create `app/admin/foods/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { listFoods, listFoodTagIds, PANEL_COLS } from "@/lib/foods";
import { listTerms } from "@/lib/taxonomies";
import PageHeader from "@/components/PageHeader";
import { addFoodAction, updateFoodAction, archiveFoodAction } from "./actions";

const LABELS: Record<string, string> = { energy_kcal: "kcal", protein_g: "Protein g", carbs_g: "Carbs g", sugars_g: "Sugars g", fat_g: "Fat g", saturates_g: "Saturates g", fibre_g: "Fibre g", salt_g: "Salt g" };

export default async function FoodsPage() {
  await requireAdmin();
  const foods = await listFoods(true);
  const allergens = await listTerms("allergen");
  const diets = await listTerms("diet");
  const tagsByFood = new Map<number, number[]>();
  for (const f of foods) tagsByFood.set(f.id, await listFoodTagIds(f.id));

  const PanelFields = ({ f }: { f?: Record<string, number> }) => (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {PANEL_COLS.map((c) => (
        <label key={c} className="stack" style={{ gap: 3, width: 92 }}>
          <span className="muted-xs">{LABELS[c]}</span>
          <input name={c} type="number" step="0.1" min="0" defaultValue={f ? f[c] : 0} />
        </label>
      ))}
    </div>
  );
  const TagPicker = ({ selected = [] as number[] }) => (
    <div className="stack" style={{ gap: 4 }}>
      <span className="muted-xs">Allergens (contains) &amp; diet suitability</span>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {[...allergens.map((t) => ({ ...t, kind: "allergen" })), ...diets.map((t) => ({ ...t, kind: "diet" }))].map((t) => (
          <label key={`${t.kind}-${t.id}`} className="row" style={{ gap: 4, alignItems: "center" }}>
            <input type="checkbox" name="tag" value={t.id} defaultChecked={selected.includes(t.id)} />
            <span className="muted-xs">{t.kind === "allergen" ? "⚠ " : "◍ "}{t.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader eyebrow="Meal planner" title="Food database" subtitle="Each food's nutrition is per one portion. Used to build recipes and meal plans." />

      <div className="card">
        <form action={addFoodAction} className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10 }}>
            <label className="stack" style={{ gap: 4, flex: 2 }}><span>Name</span><input name="name" placeholder="Scrambled eggs" required /></label>
            <label className="stack" style={{ gap: 4, flex: 1 }}><span>Portion label</span><input name="portion_label" placeholder="2 eggs (100 g)" defaultValue="1 portion" /></label>
          </div>
          <PanelFields />
          <TagPicker />
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Add food</button>
        </form>
      </div>

      {foods.map((f) => (
        <div key={f.id} className="card stack" style={{ gap: 8 }}>
          <form action={updateFoodAction} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="id" value={f.id} />
            <div className="row" style={{ gap: 10 }}>
              <label className="stack" style={{ gap: 4, flex: 2 }}><span>Name {f.status === "archived" ? <span className="muted-xs">(archived)</span> : null}</span><input name="name" defaultValue={f.name} required /></label>
              <label className="stack" style={{ gap: 4, flex: 1 }}><span>Portion label</span><input name="portion_label" defaultValue={f.portion_label} /></label>
            </div>
            <PanelFields f={f as unknown as Record<string, number>} />
            <TagPicker selected={tagsByFood.get(f.id) ?? []} />
            <button type="submit" className="btn--sm" style={{ justifySelf: "start" }}>Save</button>
          </form>
          {f.status === "active" ? (
            <form action={archiveFoodAction}><input type="hidden" name="id" value={f.id} /><button className="btn--sm">Archive</button></form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link** — in `components/AppShell.tsx`, immediately after the `{ href: "/admin/dietary-protocols", ... }` line add:

```ts
      { href: "/admin/foods", label: "Food database", icon: "grid" },
```

- [ ] **Step 4: Typecheck, migrate, commit**

```bash
npx tsc --noEmit
npm run migrate:all
git add "app/admin/foods/page.tsx" "app/admin/foods/actions.ts" components/AppShell.tsx
git commit -m "feat(3c): /admin/foods database UI (panel + allergen/diet tags)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- Spec coverage: foods table + tags + pure `foodNutrition` + admin UI ✓. Archive-not-delete ✓. Tags reuse taxonomy ✓.
- Placeholders: none. Types: `FoodPanel`/`FoodRow`/`FoodInput` used consistently; `PANEL_COLS` shared with the UI.
