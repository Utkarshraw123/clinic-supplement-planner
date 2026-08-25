import { requireAdmin } from "@/lib/auth/current-user";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { addTermAction, deleteTermAction } from "./actions";

const TYPES: { type: TermType; label: string }[] = [
  { type: "allergen", label: "Allergens" },
  { type: "ingredient", label: "Ingredients" },
  { type: "concern", label: "Concerns / goals" },
  { type: "diet", label: "Diets" },
  { type: "caution", label: "Cautions" },
];

export default async function TaxonomiesPage() {
  await requireAdmin();
  const terms = await listTerms();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Taxonomies</h1>
        <p className="muted" style={{ marginTop: 2 }}>Controlled vocabularies that power tagging, flagging, and suggestions.</p>
      </div>
      {TYPES.map(({ type, label }) => (
        <div key={type} className="card">
          <h2 style={{ marginBottom: 10 }}>{label}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {terms.filter((t) => t.type === type).length === 0 && <span className="muted-xs">None yet.</span>}
            {terms.filter((t) => t.type === type).map((t) => (
              <form key={t.id} action={deleteTermAction}>
                <input type="hidden" name="id" value={t.id} />
                <button className="badge badge--neutral" style={{ border: "none", height: "auto", cursor: "pointer" }} title="Remove">{t.label} ✕</button>
              </form>
            ))}
          </div>
          <form action={addTermAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <input type="hidden" name="type" value={type} />
            <input name="label" placeholder={`Add ${type}`} required style={{ maxWidth: 260 }} />
            <button type="submit" className="btn--sm">Add</button>
          </form>
        </div>
      ))}
    </div>
  );
}
