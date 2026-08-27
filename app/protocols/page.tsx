import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listProtocols } from "@/lib/protocols";
import { deleteProtocolAction, createProtocolAction } from "./actions";

export default async function ProtocolsPage() {
  await requireUser();
  const protocols = await listProtocols();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <p className="eyebrow">Clinical toolkit</p>
        <h1>Protocols</h1>
        <p className="muted" style={{ marginTop: 4 }}>Reusable supplement templates. Build one here from scratch, then apply it to any patient in one step from the plan builder — every product is re-checked against that patient&apos;s allergies when applied.</p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>New protocol</h2>
        <form action={createProtocolAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="name" placeholder="Protocol name — e.g. Menopause starter" required style={{ flex: "1 1 240px" }} />
          <input name="description" placeholder="Short description (optional)" style={{ flex: "1 1 240px" }} />
          <button type="submit" className="btn--primary">Create &amp; add products →</button>
        </form>
      </div>

      {protocols.length === 0 ? (
        <div className="card"><p className="muted">No protocols yet. Create one above, or build a patient&apos;s plan and use “Save as protocol”.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {protocols.map((p) => (
            <div key={p.id} className="card stack" style={{ gap: 8 }}>
              <div className="row-between">
                <h2 style={{ fontSize: 17 }}>{p.name}</h2>
                <span className="badge badge--neutral">{p.itemCount} {p.itemCount === 1 ? "item" : "items"}</span>
              </div>
              {p.description && <p className="muted" style={{ fontSize: 13 }}>{p.description}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Link href={`/protocols/${p.id}`} className="btn btn--sm btn--primary">Edit</Link>
                <form action={deleteProtocolAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn--sm">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
