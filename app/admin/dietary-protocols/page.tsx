import { requireAdmin } from "@/lib/auth/current-user";
import { listDietaryProtocols } from "@/lib/dietary-protocols";
import PageHeader from "@/components/PageHeader";
import { addDietaryProtocolAction, updateDietaryProtocolAction, deleteDietaryProtocolAction } from "@/app/admin/dietary-protocols/actions";

export default async function DietaryProtocolsPage() {
  await requireAdmin();
  const protocols = await listDietaryProtocols();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Practice settings"
        title="Dietary protocols"
        subtitle="Named eating plans you can drop into a client's Dietary recommendations in one click, then tailor."
      />

      <div className="card">
        <form action={addDietaryProtocolAction} className="stack" style={{ gap: 8 }}>
          <input name="name" placeholder="Name, e.g. Low-FODMAP" required />
          <textarea name="body" rows={5} placeholder="The dietary recommendations as they should appear on the plan…" required />
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Add dietary protocol</button>
        </form>
      </div>

      {protocols.length === 0 ? (
        <div className="card"><p className="muted">No dietary protocols yet.</p></div>
      ) : protocols.map((p) => (
        <div key={p.id} className="card stack" style={{ gap: 8 }}>
          <form action={updateDietaryProtocolAction} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="id" value={p.id} />
            <input name="name" defaultValue={p.name} required />
            <textarea name="body" rows={5} defaultValue={p.body} required />
            <button type="submit" className="btn--sm" style={{ justifySelf: "start" }}>Save</button>
          </form>
          <form action={deleteDietaryProtocolAction}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn--sm">Remove</button>
          </form>
        </div>
      ))}
    </div>
  );
}
