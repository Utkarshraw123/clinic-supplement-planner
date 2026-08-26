import { requireAdmin } from "@/lib/auth/current-user";
import { listSnippets } from "@/lib/notes";
import PageHeader from "@/components/PageHeader";
import { addSnippetAction, deleteSnippetAction } from "@/app/admin/notes/actions";

export default async function NotesPage() {
  await requireAdmin();
  const snippets = await listSnippets();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Practice settings"
        title="Reusable notes & recommendations"
        subtitle="Premade phrases the team inserts with one click — product notes, plus Lifestyle & Dietary recommendations on the guide"
      />

      <div className="card">
        <form action={addSnippetAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="text" placeholder="e.g. Aim for 2 litres of water a day" required style={{ flex: 1, minWidth: 220 }} />
          <select name="category" defaultValue="supplement" title="Where this snippet appears">
            <option value="supplement">Supplement / product note</option>
            <option value="lifestyle">Lifestyle recommendation</option>
            <option value="dietary">Dietary recommendation</option>
            <option value="intro">Personal intro</option>
            <option value="next">Next consultation</option>
            <option value="general">General</option>
          </select>
          <button type="submit" className="btn--primary">Add</button>
        </form>
        <p className="muted-xs" style={{ marginTop: 8 }}>The category controls which field on the Prepare-guide page shows the chip.</p>
      </div>

      <div className="card">
        {snippets.length === 0 ? (
          <p className="muted">No reusable notes yet. Add ones you use often — e.g. &ldquo;Add to water&rdquo;, &ldquo;Prioritise 7–8 hours of sleep&rdquo;, &ldquo;Reduce refined sugar&rdquo;.</p>
        ) : snippets.map((s) => (
          <div key={s.id} className="list-row">
            <span>{s.text} <span className="badge badge--neutral" style={{ marginLeft: 6 }}>{s.category}</span></span>
            <form action={deleteSnippetAction}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn--sm">Remove</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
