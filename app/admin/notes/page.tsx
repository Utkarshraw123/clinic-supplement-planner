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
        title="Reusable notes"
        subtitle="Common phrases the team can insert into supplement plans and product notes with one click"
      />

      <div className="card">
        <form action={addSnippetAction} style={{ display: "flex", gap: 8 }}>
          <input name="text" placeholder="e.g. Only take at night" required style={{ flex: 1 }} />
          <button type="submit" className="btn--primary">Add note</button>
        </form>
      </div>

      <div className="card">
        {snippets.length === 0 ? (
          <p className="muted">No reusable notes yet. Add ones you use often — e.g. &ldquo;Add to water&rdquo;, &ldquo;Take with food&rdquo;, &ldquo;Don&apos;t take with levothyroxine&rdquo;.</p>
        ) : snippets.map((s) => (
          <div key={s.id} className="list-row">
            <span>{s.text}</span>
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
