import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, getPlan } from "@/lib/plans";
import { listActiveProductsWithTags } from "@/lib/products";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { suggestForPatient } from "@/lib/recommend";
import { query } from "@/lib/db";
import { removeItemAction, chooseAlternativeAction, saveItemNoteAction } from "@/app/plan/actions";
import { applyProtocolAction, saveAsProtocolAction } from "@/app/protocols/actions";
import { listProtocols } from "@/lib/protocols";
import PlanItemDosing from "@/components/PlanItemDosing";
import AddToPlanButton from "@/components/AddToPlanButton";
import Toaster from "@/components/Toaster";

export default async function PlanBuilder({ params }: { params: { patientId: string } }) {
  const u = await requireUser();
  const patientId = Number(params.patientId);

  // All independent loads in one parallel wave (was ~5 sequential round-trips).
  const [patient, planId, presets, allProducts, protocols] = await Promise.all([
    getPatient(patientId),
    getOrCreateDraftPlan(patientId, u.userId),
    query<{ id: number; label: string }>("SELECT id, label FROM dosing_presets ORDER BY id"),
    listActiveProductsWithTags(),
    listProtocols(),
  ]);
  if (!patient) notFound();
  const plan = await getPlan(planId);

  const inPlan = new Set(plan!.items.map((it) => it.product.id));
  const catalog = allProducts.filter((p) => !inPlan.has(p.id));
  const suggestions = suggestForPatient(catalog, patient.attributes, 5);

  const itemFlags = plan!.items.map((it) => ({ item: it, flags: flagProductForPatient(it.product, patient.attributes) }));
  const planHasBlock = itemFlags.some(({ flags }) => hasBlock(flags));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Toaster />
      <div className="row-between">
        <div>
          <h1>{patient.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>DOB {patient.dob} · supplement plan · {plan!.status}</p>
        </div>
        <a href={`/patients/${patientId}`} className="muted">← Back to profile</a>
      </div>

      {planHasBlock && (
        <div className="safety-banner">
          <span className="badge badge--danger" style={{ marginTop: 1 }}>Allergen conflict</span>
          <div>
            <strong>This plan cannot be finalised or sent.</strong>
            <div className="safety-banner__body">
              One or more products conflict with {patient.name}&apos;s recorded allergies (see the red
              &ldquo;Blocked&rdquo; items below). Remove or swap them for an allergen-safe alternative before finalising.
            </div>
          </div>
        </div>
      )}

      {(patient.attributes.some((a) => a.attrType === "allergy" || a.attrType === "med_condition")) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span className="section-label" style={{ marginRight: 4 }}>Profile</span>
          {patient.attributes.filter((a) => a.attrType === "allergy").map((a) => (
            <span key={`al-${a.termId}`} className="badge badge--danger">Allergy: {a.label}</span>
          ))}
          {patient.attributes.filter((a) => a.attrType === "med_condition").map((a) => (
            <span key={`mc-${a.termId}`} className="badge badge--warn">Caution: {a.label}</span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="card" style={{ background: "var(--sage-tint)", borderColor: "#D4DCC2" }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <h2>Suggested for {patient.name}</h2>
            <span className="muted-xs">Allergy-safe · ranked by goals</span>
          </div>
          <div>
            {suggestions.map((sg) => (
              <div key={sg.product.id} className="list-row" style={{ borderColor: "rgba(15,110,86,0.12)" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{sg.product.name} <span className="muted-xs">· {sg.product.brand_name}</span></div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                    {sg.reasons.map((r, i) => <span key={i} className="badge badge--ok" style={{ fontSize: 11 }}>{r}</span>)}
                  </div>
                </div>
                <AddToPlanButton planId={planId} patientId={patientId} productId={sg.product.id} className="btn--sm btn--primary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {protocols.length > 0 && (
        <div className="card card--plain">
          <form action={applyProtocolAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <span style={{ fontWeight: 500, fontSize: 14 }}>Apply a protocol</span>
            <select name="protocolId" defaultValue="" style={{ flex: 1, minWidth: 200 }}>
              <option value="">Choose a saved protocol…</option>
              {protocols.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.itemCount})</option>)}
            </select>
            <button type="submit">Apply</button>
          </form>
          <p className="muted-xs" style={{ marginTop: 6 }}>Adds the protocol&apos;s products to this plan — each is re-checked against {patient.name}&apos;s profile.</p>
        </div>
      )}

      <div className="card">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <h2>Add products to the prescription</h2>
          <span className="muted-xs">{catalog.length} available</span>
        </div>
        <div>
          {catalog.slice(0, 50).map((c) => (
            <div key={c.id} className="list-row">
              <span style={{ fontSize: 14 }}>{c.name} <span className="muted-xs">· {c.brand_name}{c.form ? ` · ${c.form}` : ""}</span></span>
              <AddToPlanButton planId={planId} patientId={patientId} productId={c.id} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 10 }}>Prescription — {plan!.items.length} {plan!.items.length === 1 ? "product" : "products"}</h2>
        {plan!.items.length === 0 && <p className="muted">Nothing added yet. Add products from the suggestions or catalogue above — they&apos;ll appear here for you to set dosing and notes.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {itemFlags.map(({ item, flags }) => (
            <div key={item.id} className="card" style={{ borderColor: hasBlock(flags) ? "var(--danger)" : "var(--border)" }}>
              <div className="row-between">
                <div>
                  <div style={{ fontWeight: 600 }}>{item.product.name}</div>
                  <div className="muted-xs" style={{ marginTop: 1 }}>{item.product.brand_name}{item.product.package_size ? ` · ${item.product.package_size}` : ""}</div>
                </div>
                <form action={removeItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <button className="btn--sm">Remove</button>
                </form>
              </div>
              {flags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {flags.map((f, i) => (
                    <span key={i} className={`badge ${f.level === "block" ? "badge--danger" : "badge--warn"}`}>
                      {f.level === "block" ? "Blocked" : "Warning"}: {f.reason}
                    </span>
                  ))}
                </div>
              )}
              {item.product.alternatives.length > 0 && (
                <form action={chooseAlternativeAction} style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <select name="altId" defaultValue={item.chosenAlternativeId ?? ""} style={{ maxWidth: 320 }}>
                    <option value="">Offer an alternative format…</option>
                    {item.product.alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button type="submit" className="btn--sm">Set</button>
                </form>
              )}
              <div style={{ marginTop: 10 }}>
                <PlanItemDosing itemId={item.id} patientId={patientId} presets={presets} currentText={item.dosingText} />
              </div>
              <form action={saveItemNoteAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <input name="note" placeholder="Comment for this product (appears on the guide)" defaultValue={item.note ?? ""} style={{ flex: 1, minWidth: 220 }} />
                <button type="submit" className="btn--sm">Save note</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div className="card card--plain">
        {planHasBlock ? (
          <p style={{ color: "var(--danger)", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="badge badge--danger">Blocked</span>
            Resolve the blocked items above before this plan can be finalised and sent.
          </p>
        ) : plan!.items.length === 0 ? (
          <p className="muted">Add at least one product to finalise this plan.</p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p className="muted">Products and dosing look good. Next, write up the recommendations and send the guide.</p>
            <a href={`/plan/${patientId}/prepare`} className="btn btn--primary">Prepare guide →</a>
          </div>
        )}
      </div>

      {plan!.items.length > 0 && (
        <details className="card card--plain">
          <summary style={{ cursor: "pointer", fontWeight: 500, fontSize: 14 }}>Save this plan as a reusable protocol</summary>
          <form action={saveAsProtocolAction} className="stack" style={{ gap: 8, marginTop: 12 }}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <input name="name" placeholder="Protocol name — e.g. Postnatal energy support" required />
            <input name="description" placeholder="Short description (optional)" />
            <button type="submit" className="btn--accent" style={{ justifySelf: "start" }}>Save as protocol</button>
          </form>
        </details>
      )}
    </div>
  );
}
