import { query, execute } from "@/lib/db";
import { getProduct, type ProductDetail } from "@/lib/products";

export type PlanItemDetail = { id: number; product: ProductDetail; dosingText: string; note: string|null; chosenAlternativeId: number|null; position: number };
export type PlanDetail = { id: number; patientId: number; status: "draft"|"finalised"; items: PlanItemDetail[] };

export async function getOrCreateDraftPlan(patientId: number, authorId?: number): Promise<number> {
  const existing = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'draft' ORDER BY id DESC LIMIT 1", [patientId]);
  if (existing[0]) return existing[0].id;
  const rs = await execute("INSERT INTO plans (patient_id, author_id) VALUES (?, ?)", [patientId, authorId ?? null]);
  return Number(rs.lastInsertRowid);
}

export async function addPlanItem(planId: number, productId: number): Promise<number> {
  const pos = await query<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM plan_items WHERE plan_id = ?", [planId]);
  const rs = await execute("INSERT INTO plan_items (plan_id, product_id, position) VALUES (?, ?, ?)", [planId, productId, pos[0].n]);
  await execute("UPDATE plans SET updated_at = datetime('now') WHERE id = ?", [planId]);
  return Number(rs.lastInsertRowid);
}

export async function removePlanItem(itemId: number): Promise<void> {
  await execute("DELETE FROM plan_items WHERE id = ?", [itemId]);
}

export async function setItemDosing(itemId: number, presetId: number|null, customText: string|null): Promise<void> {
  await execute("UPDATE plan_items SET dosing_preset_id = ?, dosing_custom_text = ? WHERE id = ?", [presetId, customText, itemId]);
}

export async function setItemAlternative(itemId: number, altProductId: number|null): Promise<void> {
  await execute("UPDATE plan_items SET chosen_alternative_id = ? WHERE id = ?", [altProductId, itemId]);
}

export async function setItemNote(itemId: number, note: string|null): Promise<void> {
  await execute("UPDATE plan_items SET note = ? WHERE id = ?", [note && note.trim() ? note.trim() : null, itemId]);
}

export async function dosingTextFor(presetId: number|null, customText: string|null): Promise<string> {
  if (customText && customText.trim()) return customText.trim();
  if (presetId) {
    const rows = await query<{ text: string }>("SELECT text FROM dosing_presets WHERE id = ?", [presetId]);
    return rows[0]?.text ?? "";
  }
  return "";
}

export async function getPlan(planId: number): Promise<PlanDetail | null> {
  const base = await query<{ id: number; patient_id: number; status: "draft"|"finalised" }>(
    "SELECT id, patient_id, status FROM plans WHERE id = ?", [planId]
  );
  if (!base[0]) return null;
  const itemRows = await query<{ id: number; product_id: number; dosing_preset_id: number|null; dosing_custom_text: string|null; note: string|null; chosen_alternative_id: number|null; position: number }>(
    "SELECT id, product_id, dosing_preset_id, dosing_custom_text, note, chosen_alternative_id, position FROM plan_items WHERE plan_id = ? ORDER BY position", [planId]
  );
  const items: PlanItemDetail[] = [];
  for (const r of itemRows) {
    const product = await getProduct(r.product_id);
    if (!product) continue;
    items.push({
      id: r.id,
      product,
      dosingText: await dosingTextFor(r.dosing_preset_id, r.dosing_custom_text),
      note: r.note,
      chosenAlternativeId: r.chosen_alternative_id,
      position: r.position,
    });
  }
  return { id: base[0].id, patientId: base[0].patient_id, status: base[0].status, items };
}

export async function finalisePlan(planId: number): Promise<void> {
  await execute("UPDATE plans SET status = 'finalised', updated_at = datetime('now') WHERE id = ?", [planId]);
}
