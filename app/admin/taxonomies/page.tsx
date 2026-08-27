import { requireAdmin } from "@/lib/auth/current-user";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { addTermAction, deleteTermAction } from "./actions";

const TYPES: { type: TermType; label: string; hint: string }[] = [
  { type: "allergen", label: "Allergens", hint: "The “contains” list. If one matches a patient’s allergy, the product is HARD-BLOCKED." },
  { type: "ingredient", label: "Ingredients", hint: "What’s inside each product — also checked against a patient’s allergies." },
  { type: "concern", label: "Concerns / goals", hint: "Health goals (Sleep, Energy…). Used to suggest suitable products." },
  { type: "diet", label: "Diets", hint: "Dietary suitability (Vegan, Halal…). Flags products that don’t fit a patient’s diet." },
  { type: "caution", label: "Cautions", hint: "Medications & conditions recorded on a patient. Raises a warning on the plan." },
];

export default async function TaxonomiesPage() {
  await requireAdmin();
  const terms = await listTerms();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h1>Taxonomies</h1>
        <p className="muted" style={{ marginTop: 2 }}>The master word-lists the whole app tags from — so “mushroom” always means the same mushroom everywhere.</p>
      </div>

      <div className="card card--plain">
        <p className="eyebrow" style={{ marginBottom: 6 }}>What is this?</p>
        <p style={{ fontSize: 14 }}>
          These are the shared, controlled lists you tag <strong>products</strong> and <strong>patients</strong> from. Keeping them tidy is what makes the safety checks reliable: an allergy only blocks a product because both use the <em>exact same</em> term from the same list. In day-to-day work no one types free text — they tick terms from these lists (and can add a missing one on the spot). Edit them here only to add, rename, or retire a term for the whole practice.
        </p>
      </div>

      {TYPES.map(({ type, label, hint }) => (
        <div key={type} className="card">
          <h2 style={{ marginBottom: 2 }}>{label}</h2>
          <p className="muted-xs" style={{ marginBottom: 10 }}>{hint}</p>
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
