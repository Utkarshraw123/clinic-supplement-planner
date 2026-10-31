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
  const targets: Record<string, number | null> = { energy_kcal: plan.target_kcal, protein_g: plan.target_protein_g, carbs_g: plan.target_carbs_g, fat_g: plan.target_fat_g, fibre_g: plan.target_fibre_g, salt_g: plan.target_salt_g };

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

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <form action={addDayAction.bind(null, id)}><button className="btn">+ Add day</button></form>
        <form action={saveAsTemplateAction.bind(null, id)} className="row" style={{ gap: 6 }}>
          <input name="title" placeholder="Template name" defaultValue={plan.title ?? "Template"} />
          <button className="btn">Save as template</button>
        </form>
      </div>
    </div>
  );
}
