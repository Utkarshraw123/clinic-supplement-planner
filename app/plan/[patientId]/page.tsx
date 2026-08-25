import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, getPlan } from "@/lib/plans";
import { searchProducts, getProduct } from "@/lib/products";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { suggestForPatient } from "@/lib/recommend";
import { query } from "@/lib/db";
import { addItemAction, removeItemAction, chooseAlternativeAction, finaliseAndSendAction } from "@/app/plan/actions";
import PlanItemDosing from "@/components/PlanItemDosing";

export default async function PlanBuilder({ params }: { params: { patientId: string } }) {
  const u = await requireUser();
  const patientId = Number(params.patientId);
  const patient = await getPatient(patientId);
  if (!patient) notFound();
  const planId = await getOrCreateDraftPlan(patientId, u.userId);
  const plan = await getPlan(planId);
  const presets = await query<{ id: number; label: string }>("SELECT id, label FROM dosing_presets ORDER BY id");
  const catalog = await searchProducts("");

  const inPlan = new Set(plan!.items.map((it) => it.product.id));
  const fullCatalog = (await Promise.all(catalog.map((c) => getProduct(c.id)))).filter((p): p is NonNullable<typeof p> => !!p && !inPlan.has(p.id));
  const suggestions = suggestForPatient(fullCatalog, patient.attributes, 5);

  const itemFlags = plan!.items.map((it) => ({ item: it, flags: flagProductForPatient(it.product, patient.attributes) }));
  const planHasBlock = itemFlags.some(({ flags }) => hasBlock(flags));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <div>
          <h1>{patient.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>DOB {patient.dob} · supplement plan · {plan!.status}</p>
        </div>
        <a href={`/patients/${patientId}`} className="muted">← Back to profile</a>
      </div>

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
                <form action={addItemAction}>
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="productId" value={sg.product.id} />
                  <button type="submit" className="btn--sm btn--primary">Add</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>Add a product</h2>
        <div>
          {catalog.slice(0, 50).map((c) => (
            <div key={c.id} className="list-row">
              <span style={{ fontSize: 14 }}>{c.name} <span className="muted-xs">· {c.brand_name}{c.form ? ` · ${c.form}` : ""}</span></span>
              <form action={addItemAction}>
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="productId" value={c.id} />
                <button type="submit" className="btn--sm">Add</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 10 }}>Plan — {plan!.items.length} {plan!.items.length === 1 ? "item" : "items"}</h2>
        {plan!.items.length === 0 && <p className="muted">No items yet. Add products from the suggestions or catalog above.</p>}
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
          <form action={finaliseAndSendAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <label className="muted" style={{ whiteSpace: "nowrap" }}>Send to</label>
            <input name="email" type="email" placeholder="client@email.com" required style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" className="btn--primary">Finalise &amp; send</button>
          </form>
        )}
      </div>
    </div>
  );
}
