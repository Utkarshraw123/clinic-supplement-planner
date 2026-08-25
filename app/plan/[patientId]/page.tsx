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
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>{patient.name} — plan</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>DOB {patient.dob} · {plan!.status}</p>

      <div style={{ margin: "12px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {patient.attributes.filter((a) => a.attrType === "allergy").map((a) => (
          <span key={`al-${a.termId}`} style={{ fontSize: 12, background: "#FCEBEB", color: "#A32D2D", padding: "3px 9px", borderRadius: 8 }}>Allergy: {a.label}</span>
        ))}
        {patient.attributes.filter((a) => a.attrType === "med_condition").map((a) => (
          <span key={`mc-${a.termId}`} style={{ fontSize: 12, background: "#FAEEDA", color: "#854F0B", padding: "3px 9px", borderRadius: 8 }}>Caution: {a.label}</span>
        ))}
      </div>

      {suggestions.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h2 style={{ fontWeight: 500, fontSize: 16 }}>Suggested for {patient.name}</h2>
          <p style={{ fontSize: 12, color: "#5F5E5A" }}>Allergy-safe, ranked by this patient&apos;s goals.</p>
          <ul>
            {suggestions.map((sg) => (
              <li key={sg.product.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                <span>
                  {sg.product.name} · {sg.product.brand_name}
                  <span style={{ fontSize: 12, color: "#0F6E56" }}> — {sg.reasons.join(" · ")}</span>
                </span>
                <form action={addItemAction}>
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="productId" value={sg.product.id} />
                  <button type="submit">Add</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Add a product</h2>
        <ul>
          {catalog.slice(0, 50).map((c) => (
            <li key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{c.name} · {c.brand_name}</span>
              <form action={addItemAction}>
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="productId" value={c.id} />
                <button type="submit">Add</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Plan — {plan!.items.length} items</h2>
        {itemFlags.map(({ item, flags }) => (
          <div key={item.id} style={{ border: "0.5px solid #ddd", borderRadius: 12, padding: 12, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontWeight: 500 }}>{item.product.name}</strong>
              <form action={removeItemAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <button>Remove</button>
              </form>
            </div>
            {flags.map((f, i) => (
              <p key={i} style={{ fontSize: 12, margin: "4px 0", color: f.level === "block" ? "#A32D2D" : "#854F0B" }}>
                {f.level === "block" ? "BLOCK" : "Warning"}: {f.reason}
              </p>
            ))}
            {item.product.alternatives.length > 0 && (
              <form action={chooseAlternativeAction} style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <select name="altId" defaultValue={item.chosenAlternativeId ?? ""}>
                  <option value="">— offer an alternative format —</option>
                  {item.product.alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button type="submit">Set</button>
              </form>
            )}
            <PlanItemDosing itemId={item.id} patientId={patientId} presets={presets} currentText={item.dosingText} />
          </div>
        ))}
      </section>

      <section style={{ marginTop: 20 }}>
        {planHasBlock ? (
          <p style={{ color: "#A32D2D", fontSize: 14 }}>Resolve the blocked items above before this plan can be finalised and sent.</p>
        ) : (
          <form action={finaliseAndSendAction} style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <input name="email" type="email" placeholder="client@email.com" required />
            <button type="submit">Finalise &amp; send</button>
          </form>
        )}
      </section>
    </main>
  );
}
