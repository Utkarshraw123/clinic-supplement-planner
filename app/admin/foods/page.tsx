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
  const TagPicker = ({ selected = [] as number[] }: { selected?: number[] }) => (
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
