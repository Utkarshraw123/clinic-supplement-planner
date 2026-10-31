# Phase 3c-4 — Meal-Plan Builder UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The practitioner meal-plan UI — list, new (title + patient + targets), the builder grid (days → meals → items with a food/recipe picker, per-day totals vs targets, and a warnings panel), templates list + apply, a patient-page Meal plans card, and the nav link.

**Architecture:** Server components + server-action forms (one small form per add/remove, revalidating the plan) — robust and simple, no large client component. `getMealPlan` supplies the resolved tree with computed nutrition; `planWarnings` the warnings. Item pickers use a single `<select>` whose option values are `food:<id>` / `recipe:<id>`.

**Tech Stack:** Next.js 14 server actions, `@libsql/client`.

## Global Constraints

- Depends on 3c-1/3c-2/3c-3. PDF + email buttons arrive in 3c-5 (not here).
- Keep tests green, tsc clean, Co-Authored-By trailer. Round nutrition for display only (kcal integer, grams 1dp).

---

### Task 1: Actions — `app/meal-plans/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import {
  createMealPlan, updatePlanMeta, addDay, removeDay, addMeal, renameMeal, removeMeal,
  addItem, removeItem, finaliseMealPlan, saveAsTemplate, applyTemplate,
} from "@/lib/meal-plans";

const num = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export async function createMealPlanAction(fd: FormData) {
  const u = await requireUser();
  const patientId = Number(fd.get("patientId"));
  const id = await createMealPlan(patientId, {
    title: String(fd.get("title") || "Meal plan"),
    targetKcal: num(fd.get("target_kcal")), targetProtein: num(fd.get("target_protein_g")),
    targetCarbs: num(fd.get("target_carbs_g")), targetFat: num(fd.get("target_fat_g")),
    targetFibre: num(fd.get("target_fibre_g")), targetSalt: num(fd.get("target_salt_g")),
  }, u.userId);
  await addDay(id);
  redirect(`/meal-plans/${id}`);
}

export async function saveMetaAction(planId: number, fd: FormData) {
  await requireUser();
  await updatePlanMeta(planId, {
    title: String(fd.get("title") || ""), notes: String(fd.get("notes") || ""), startDate: String(fd.get("start_date") || ""),
    targetKcal: num(fd.get("target_kcal")), targetProtein: num(fd.get("target_protein_g")),
    targetCarbs: num(fd.get("target_carbs_g")), targetFat: num(fd.get("target_fat_g")),
    targetFibre: num(fd.get("target_fibre_g")), targetSalt: num(fd.get("target_salt_g")),
  });
  revalidatePath(`/meal-plans/${planId}`);
}

export async function addDayAction(planId: number, _fd?: FormData) { await requireUser(); await addDay(planId); revalidatePath(`/meal-plans/${planId}`); }
export async function removeDayAction(planId: number, dayId: number, _fd?: FormData) { await requireUser(); await removeDay(dayId); revalidatePath(`/meal-plans/${planId}`); }
export async function addMealAction(planId: number, dayId: number, fd: FormData) { await requireUser(); await addMeal(dayId, String(fd.get("name") || "Meal")); revalidatePath(`/meal-plans/${planId}`); }
export async function removeMealAction(planId: number, mealId: number, _fd?: FormData) { await requireUser(); await removeMeal(mealId); revalidatePath(`/meal-plans/${planId}`); }

export async function addItemAction(planId: number, mealId: number, fd: FormData) {
  await requireUser();
  const ref = String(fd.get("ref") || "");
  const quantity = Number(fd.get("quantity") || 1) || 1;
  const [kind, idStr] = ref.split(":");
  const id = Number(idStr);
  if (kind === "food" && id) await addItem(mealId, { itemType: "food", foodId: id, quantity });
  else if (kind === "recipe" && id) await addItem(mealId, { itemType: "recipe", recipeId: id, quantity });
  revalidatePath(`/meal-plans/${planId}`);
}
export async function removeItemAction(planId: number, itemId: number, _fd?: FormData) { await requireUser(); await removeItem(itemId); revalidatePath(`/meal-plans/${planId}`); }

export async function finaliseMealPlanAction(planId: number, _fd?: FormData) { const u = await requireUser(); await finaliseMealPlan(planId, u.userId); revalidatePath(`/meal-plans/${planId}`); }
export async function saveAsTemplateAction(planId: number, fd: FormData) { const u = await requireUser(); await saveAsTemplate(planId, String(fd.get("title") || "Template"), u.userId); revalidatePath(`/meal-plans/${planId}`); }
export async function applyTemplateAction(templateId: number, fd: FormData) { const u = await requireUser(); const pid = Number(fd.get("patientId")); const id = await applyTemplate(templateId, pid, u.userId); redirect(`/meal-plans/${id}`); }
```

### Task 2: List + New + Templates pages

`app/meal-plans/page.tsx`:
```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { query } from "@/lib/db";

export default async function MealPlansPage() {
  await requireUser();
  const rows = await query<{ id: number; title: string | null; status: string; patient_name: string | null }>(
    "SELECT mp.id, mp.title, mp.status, p.name AS patient_name FROM meal_plans mp LEFT JOIN patients p ON p.id = mp.patient_id WHERE mp.is_template = 0 ORDER BY mp.id DESC"
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between"><h1>Meal plans</h1><Link href="/meal-plans/templates" className="btn--sm">Templates</Link></div>
      <div className="card stack" style={{ gap: 8 }}>
        {rows.length === 0 ? <p className="muted">No meal plans yet. Create one from a patient&apos;s page.</p> : rows.map((r) => (
          <Link key={r.id} href={`/meal-plans/${r.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{r.title ?? "Meal plan"} · {r.patient_name ?? "—"}</span><span className="muted"><strong>{r.status}</strong></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

`app/meal-plans/new/page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import { createMealPlanAction } from "../actions";

export default async function NewMealPlanPage({ searchParams }: { searchParams: { patientId?: string } }) {
  await requireUser();
  const patients = await listPatients();
  const preset = searchParams.patientId ? Number(searchParams.patientId) : null;
  const T = [["target_kcal", "kcal"], ["target_protein_g", "Protein g"], ["target_carbs_g", "Carbs g"], ["target_fat_g", "Fat g"], ["target_fibre_g", "Fibre g"], ["target_salt_g", "Salt g"]];
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
      <h1>New meal plan</h1>
      <form action={createMealPlanAction} className="card stack" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}><span>Patient</span>
          <select name="patientId" defaultValue={preset ?? ""} required>
            <option value="" disabled>Choose a patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}><span>Title</span><input name="title" defaultValue="Meal plan" /></label>
        <span className="muted-xs">Daily targets (optional)</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {T.map(([n, l]) => <label key={n} className="stack" style={{ gap: 3, width: 92 }}><span className="muted-xs">{l}</span><input name={n} type="number" step="0.1" min="0" /></label>)}
        </div>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create &amp; open</button>
      </form>
    </div>
  );
}
```

`app/meal-plans/templates/page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { listTemplates } from "@/lib/meal-plans";
import { listPatients } from "@/lib/patients";
import { applyTemplateAction } from "../actions";

export default async function TemplatesPage() {
  await requireUser();
  const templates = await listTemplates();
  const patients = await listPatients();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
      <h1>Meal-plan templates</h1>
      {templates.length === 0 ? <div className="card"><p className="muted">No templates yet. Save a plan as a template from its page.</p></div> : templates.map((t) => (
        <div key={t.id} className="card row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{t.title ?? "Template"}</span>
          <form action={applyTemplateAction.bind(null, t.id)} className="row" style={{ gap: 8 }}>
            <select name="patientId" required defaultValue=""><option value="" disabled>Apply to…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn--primary btn--sm">Apply</button>
          </form>
        </div>
      ))}
    </div>
  );
}
```

### Task 3: Builder grid — `app/meal-plans/[id]/page.tsx`

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getMealPlan, planWarnings, PANEL_KEYS } from "@/lib/meal-plans";
import { getPatient } from "@/lib/patients";
import { listFoods } from "@/lib/foods";
import { listRecipes } from "@/lib/recipes";
import { saveMetaAction, addDayAction, removeDayAction, addMealAction, removeMealAction, addItemAction, removeItemAction, finaliseMealPlanAction, saveAsTemplateAction } from "../actions";

const LABELS: Record<string, string> = { energy_kcal: "kcal", protein_g: "P", carbs_g: "C", sugars_g: "sug", fat_g: "F", saturates_g: "sat", fibre_g: "fib", salt_g: "salt" };
const fmt = (k: string, v: number) => (k === "energy_kcal" ? Math.round(v).toString() : v.toFixed(1));

export default async function MealPlanBuilder({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const tree = await getMealPlan(id);
  if (!tree) notFound();
  const { plan, days } = tree;
  const patient = plan.patient_id ? await getPatient(plan.patient_id) : null;
  const warnings = plan.patient_id ? await planWarnings(id, plan.patient_id) : [];
  const foods = await listFoods();
  const recipes = await listRecipes();
  const targets: Record<string, number | null> = { energy_kcal: plan.target_kcal, protein_g: plan.target_protein_g, carbs_g: plan.target_carbs_g, fat_g: plan.target_fat_g, fibre_g: plan.target_fibre_g, salt_g: plan.target_salt_g } as Record<string, number | null>;

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <div className="row-between">
        <div><h1>{plan.title ?? "Meal plan"}</h1><p className="muted">{patient?.name ?? "—"} · <strong>{plan.status}</strong></p></div>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/api/meal-plans/${id}/pdf`} target="_blank" className="btn--sm">Download PDF</Link>
          {plan.status === "draft" ? <form action={finaliseMealPlanAction.bind(null, id)}><button className="btn--primary btn--sm">Finalise</button></form> : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <strong style={{ color: "var(--danger)" }}>Warnings</strong>
          <ul className="muted-xs" style={{ margin: "6px 0 0" }}>{warnings.map((w, i) => <li key={i}>{w.dayLabel} · {w.mealName} · {w.itemLabel} — {w.message}</li>)}</ul>
        </div>
      ) : null}

      <details className="card"><summary>Plan settings &amp; targets</summary>
        <form action={saveMetaAction.bind(null, id)} className="stack" style={{ gap: 10, marginTop: 10 }}>
          <label className="stack" style={{ gap: 4 }}><span>Title</span><input name="title" defaultValue={plan.title ?? ""} /></label>
          <label className="stack" style={{ gap: 4 }}><span>Start date</span><input name="start_date" type="date" defaultValue={plan.start_date ?? ""} /></label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {([["target_kcal", plan.target_kcal], ["target_protein_g", plan.target_protein_g], ["target_carbs_g", plan.target_carbs_g], ["target_fat_g", plan.target_fat_g], ["target_fibre_g", plan.target_fibre_g], ["target_salt_g", plan.target_salt_g]] as const).map(([n, v]) => (
              <label key={n} className="stack" style={{ gap: 3, width: 92 }}><span className="muted-xs">{n.replace("target_", "").replace("_g", " g")}</span><input name={n} type="number" step="0.1" min="0" defaultValue={v ?? ""} /></label>
            ))}
          </div>
          <label className="stack" style={{ gap: 4 }}><span>Notes</span><textarea name="notes" rows={2} defaultValue={plan.notes ?? ""} /></label>
          <button className="btn--sm" style={{ justifySelf: "start" }}>Save settings</button>
        </form>
      </details>

      {days.map((d) => (
        <div key={d.id} className="card stack" style={{ gap: 10 }}>
          <div className="row-between"><h2 style={{ fontSize: 16, margin: 0 }}>{d.label}</h2>
            <form action={removeDayAction.bind(null, id, d.id)}><button className="btn--sm">Remove day</button></form>
          </div>
          {d.meals.map((m) => (
            <div key={m.id} className="stack" style={{ gap: 6, borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
              <div className="row-between"><strong>{m.name}</strong>
                <form action={removeMealAction.bind(null, id, m.id)}><button className="btn--sm">×</button></form>
              </div>
              {m.items.map((it) => (
                <div key={it.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span>{it.label} × {it.quantity} <span className="muted-xs">({it.item_type})</span></span>
                  <span className="row" style={{ gap: 8, alignItems: "center" }}><span className="muted-xs">{Math.round(it.nutrition.energy_kcal)} kcal</span>
                    <form action={removeItemAction.bind(null, id, it.id)}><button className="btn--sm">×</button></form></span>
                </div>
              ))}
              <form action={addItemAction.bind(null, id, m.id)} className="row" style={{ gap: 6 }}>
                <select name="ref" required defaultValue="" style={{ flex: 1 }}>
                  <option value="" disabled>Add food or recipe…</option>
                  <optgroup label="Foods">{foods.map((f) => <option key={`f${f.id}`} value={`food:${f.id}`}>{f.name} ({f.portion_label})</option>)}</optgroup>
                  <optgroup label="Recipes">{recipes.map((r) => <option key={`r${r.id}`} value={`recipe:${r.id}`}>{r.name}</option>)}</optgroup>
                </select>
                <input name="quantity" type="number" step="0.25" min="0" defaultValue={1} style={{ width: 70 }} />
                <button className="btn--sm">Add</button>
              </form>
            </div>
          ))}
          <form action={addMealAction.bind(null, id, d.id)} className="row" style={{ gap: 6 }}>
            <input name="name" placeholder="Add a meal slot (e.g. Supper)" style={{ flex: 1 }} />
            <button className="btn--sm">+ Meal</button>
          </form>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", paddingTop: 6 }}>
            {PANEL_KEYS.map((k) => {
              const t = targets[k];
              const v = d.totals[k];
              const over = t != null && v > t;
              return <span key={k} className="muted-xs" style={{ color: over ? "var(--danger)" : undefined }}>{LABELS[k]} {fmt(k, v)}{t != null ? ` / ${fmt(k, t)}` : ""}</span>;
            })}
          </div>
        </div>
      ))}

      <div className="row" style={{ gap: 8 }}>
        <form action={addDayAction.bind(null, id)}><button className="btn">+ Add day</button></form>
        <form action={saveAsTemplateAction.bind(null, id)} className="row" style={{ gap: 6 }}>
          <input name="title" placeholder="Template name" defaultValue={plan.title ?? "Template"} />
          <button className="btn">Save as template</button>
        </form>
      </div>
    </div>
  );
}
```

### Task 4: Patient-page card + nav

- In `app/patients/[id]/page.tsx`: add `import { listMealPlansForPatient } from "@/lib/meal-plans";`, load `const mealPlans = await listMealPlansForPatient(id);`, and render a **Meal plans card** immediately before the Invoices card:

```tsx
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Meal plans</h2>
          <Link href={`/meal-plans/new?patientId=${id}`} className="btn--primary">+ New meal plan</Link>
        </div>
        {mealPlans.length === 0 ? <p className="muted">No meal plans.</p> : mealPlans.map((mp) => (
          <Link key={mp.id} href={`/meal-plans/${mp.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{mp.title ?? "Meal plan"}</span><span className="muted"><strong>{mp.status}</strong></span>
          </Link>
        ))}
      </div>
```

- In `components/AppShell.tsx`, after the `{ href: "/recipes", ... }` line add `{ href: "/meal-plans", label: "Meal plans", icon: "grid" },`.

### Task 5: Typecheck + commit

```bash
npx tsc --noEmit
git add "app/meal-plans" "app/patients/[id]/page.tsx" components/AppShell.tsx
git commit -m "feat(3c): meal-plan builder UI (grid, per-day totals vs targets, warnings, templates)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- Spec coverage: list/new/builder/templates + patient card + nav ✓; per-day totals vs targets + warnings panel ✓; item picker food|recipe ✓; save-as-template + apply ✓.
- Note: the Download PDF link points at `/api/meal-plans/[id]/pdf`, created in 3c-5; until then it 404s (harmless). Email button is added in 3c-5.
