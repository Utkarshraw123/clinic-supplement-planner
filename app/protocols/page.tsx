import { requireUser } from "@/lib/auth/current-user";
import { listProtocols } from "@/lib/protocols";
import { deleteProtocolAction } from "./actions";

export default async function ProtocolsPage() {
  await requireUser();
  const protocols = await listProtocols();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <p className="eyebrow">Clinical toolkit</p>
        <h1>Protocols</h1>
        <p className="muted" style={{ marginTop: 4 }}>Reusable supplement sets you can apply to any patient in one step. Save a plan as a protocol from the plan builder.</p>
      </div>
      {protocols.length === 0 ? (
        <div className="card"><p className="muted">No protocols yet. Open a patient&apos;s plan, build it, then use “Save as protocol”.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {protocols.map((p) => (
            <div key={p.id} className="card stack" style={{ gap: 8 }}>
              <div className="row-between">
                <h2 style={{ fontSize: 17 }}>{p.name}</h2>
                <span className="badge badge--neutral">{p.itemCount} {p.itemCount === 1 ? "item" : "items"}</span>
              </div>
              {p.description && <p className="muted" style={{ fontSize: 13 }}>{p.description}</p>}
              <form action={deleteProtocolAction} style={{ marginTop: 4 }}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn--sm">Delete</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
