import { requireAdmin } from "@/lib/auth/current-user";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { addTermAction, deleteTermAction } from "./actions";

const TYPES: TermType[] = ["allergen","ingredient","concern","diet","caution"];

export default async function TaxonomiesPage() {
  await requireAdmin();
  const terms = await listTerms();
  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Taxonomies</h1>
      {TYPES.map((type) => (
        <section key={type} style={{ marginTop: 20 }}>
          <h2 style={{ fontWeight: 500, fontSize: 16, textTransform: "capitalize" }}>{type}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {terms.filter((t) => t.type === type).map((t) => (
              <form key={t.id} action={deleteTermAction}>
                <input type="hidden" name="id" value={t.id} />
                <button style={{ fontSize: 12 }}>{t.label} ✕</button>
              </form>
            ))}
          </div>
          <form action={addTermAction} style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input type="hidden" name="type" value={type} />
            <input name="label" placeholder={`Add ${type}`} required />
            <button type="submit">Add</button>
          </form>
        </section>
      ))}
    </main>
  );
}
