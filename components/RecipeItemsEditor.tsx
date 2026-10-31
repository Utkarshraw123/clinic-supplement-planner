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
