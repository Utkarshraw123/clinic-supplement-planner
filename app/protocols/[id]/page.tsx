import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProtocol } from "@/lib/protocols";
import { listActiveProductsWithTags } from "@/lib/products";
import { listDosingPresets } from "@/lib/dosing";
import {
  updateProtocolMetaAction, addProtocolItemAction, removeProtocolItemAction, setProtocolItemDosingAction,
  updateProtocolSectionsAction,
} from "@/app/protocols/actions";

export default async function ProtocolEditor({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const [protocol, presets, allProducts] = await Promise.all([
    getProtocol(id),
    listDosingPresets(),
    listActiveProductsWithTags(),
  ]);
  if (!protocol) notFound();

  const inProtocol = new Set(protocol.items.map((it) => it.productId));
  const catalog = allProducts.filter((p) => !inProtocol.has(p.id));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <div>
          <p className="eyebrow">Protocol template</p>
          <h1>{protocol.name}</h1>
        </div>
        <Link href="/protocols" className="muted">← All protocols</Link>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Details</h2>
        <form action={updateProtocolMetaAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={protocol.id} />
          <label className="stack" style={{ gap: 5 }}><span>Name</span>
            <input name="name" defaultValue={protocol.name} required />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Description <span className="muted-xs">(optional)</span></span>
            <input name="description" defaultValue={protocol.description ?? ""} placeholder="e.g. Postnatal energy support — first 8 weeks" />
          </label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save details</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Guide text (page 2)</h2>
        <p className="muted-xs" style={{ marginBottom: 12 }}>
          When applied to a plan, each section fills an empty section or is added underneath existing text.
          The personal intro, medications and consultation date are never part of a protocol — they belong to each patient.
        </p>
        <form action={updateProtocolSectionsAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={protocol.id} />
          <label className="stack" style={{ gap: 5 }}><span>Next consultation</span>
            <textarea name="nextConsultation" rows={2} defaultValue={protocol.nextConsultation ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Lifestyle &amp; other recommendations</span>
            <textarea name="lifestyle" rows={4} defaultValue={protocol.lifestyle ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Dietary recommendations</span>
            <textarea name="dietary" rows={4} defaultValue={protocol.dietary ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Notes</span>
            <textarea name="notes" rows={3} defaultValue={protocol.notes ?? ""} />
          </label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save guide text</button>
        </form>
      </div>

      <div className="card card--plain">
        <p className="muted-xs">This is a reusable <strong>template</strong> — no patient is attached, so there are no safety flags here. When you apply it to a patient in the plan builder, every product is re-checked against that patient&apos;s allergies.</p>
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <h2>Add products to the protocol</h2>
          <span className="muted-xs">{catalog.length} available</span>
        </div>
        <div>
          {catalog.slice(0, 50).map((c) => (
            <div key={c.id} className="list-row">
              <span style={{ fontSize: 14 }}>{c.name} <span className="muted-xs">· {c.brand_name}{c.form ? ` · ${c.form}` : ""}</span></span>
              <form action={addProtocolItemAction}>
                <input type="hidden" name="protocolId" value={protocol.id} />
                <input type="hidden" name="productId" value={c.id} />
                <button type="submit" className="btn--sm">Add</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 10 }}>Protocol — {protocol.items.length} {protocol.items.length === 1 ? "product" : "products"}</h2>
        {protocol.items.length === 0 && <p className="muted">No products yet. Add them from the catalogue above and set a default dose for each.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {protocol.items.map((item) => (
            <div key={item.itemId} className="card">
              <div className="row-between">
                <div>
                  <div style={{ fontWeight: 600 }}>{item.productName}</div>
                  <div className="muted-xs" style={{ marginTop: 1 }}>{item.brandName}</div>
                  {[item.duration, item.size, item.note, item.orderCode ? `code ${item.orderCode}` : null].some(Boolean) && (
                    <div className="muted-xs" style={{ marginTop: 4 }}>
                      {[item.duration, item.size, item.note, item.orderCode ? `code ${item.orderCode}` : null].filter(Boolean).join("  ·  ")}
                    </div>
                  )}
                </div>
                <form action={removeProtocolItemAction}>
                  <input type="hidden" name="itemId" value={item.itemId} />
                  <input type="hidden" name="protocolId" value={protocol.id} />
                  <button className="btn--sm">Remove</button>
                </form>
              </div>
              <form action={setProtocolItemDosingAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <input type="hidden" name="itemId" value={item.itemId} />
                <input type="hidden" name="protocolId" value={protocol.id} />
                <select name="presetId" defaultValue={item.dosingPresetId ?? ""}>
                  <option value="">— preset —</option>
                  {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <input name="customText" placeholder="or custom instruction" defaultValue={item.dosingCustomText ?? ""} style={{ flex: 1, minWidth: 180 }} />
                <button type="submit" className="btn--sm">Save dosing</button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
