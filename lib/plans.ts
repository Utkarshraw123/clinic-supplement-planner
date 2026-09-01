import { query, execute, getDb } from "@/lib/db";
import { getProductsByIds, type ProductDetail } from "@/lib/products";

export { DURATION_OPTIONS } from "@/lib/durations";

export type PlanItemDetail = { id: number; product: ProductDetail; dosingText: string; note: string|null; duration: string|null; orderCode: string|null; size: string|null; chosenAlternativeId: number|null; position: number };
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

export async function setItemDuration(itemId: number, duration: string|null): Promise<void> {
  await execute("UPDATE plan_items SET duration = ? WHERE id = ?", [duration && duration.trim() ? duration.trim() : null, itemId]);
}

export async function setItemOrderCode(itemId: number, code: string|null): Promise<void> {
  await execute("UPDATE plan_items SET order_code = ? WHERE id = ?", [code && code.trim() ? code.trim() : null, itemId]);
}

export async function setItemSize(itemId: number, size: string|null): Promise<void> {
  await execute("UPDATE plan_items SET size = ? WHERE id = ?", [size && size.trim() ? size.trim() : null, itemId]);
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
  // Wave 1: plan header, its items, and all dosing presets — in parallel.
  const [base, itemRows, presets] = await Promise.all([
    query<{ id: number; patient_id: number; status: "draft"|"finalised" }>(
      "SELECT id, patient_id, status FROM plans WHERE id = ?", [planId]),
    query<{ id: number; product_id: number; dosing_preset_id: number|null; dosing_custom_text: string|null; note: string|null; duration: string|null; order_code: string|null; size: string|null; chosen_alternative_id: number|null; position: number }>(
      "SELECT id, product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size, chosen_alternative_id, position FROM plan_items WHERE plan_id = ? ORDER BY position", [planId]),
    query<{ id: number; text: string }>("SELECT id, text FROM dosing_presets"),
  ]);
  if (!base[0]) return null;

  // Wave 2: every item's product in one batched load (constant queries, not N×).
  const presetText = new Map(presets.map((p) => [p.id, p.text]));
  const products = await getProductsByIds([...new Set(itemRows.map((r) => r.product_id))]);

  const items: PlanItemDetail[] = [];
  for (const r of itemRows) {
    const product = products.get(r.product_id);
    if (!product) continue;
    const dosingText = r.dosing_custom_text?.trim()
      ? r.dosing_custom_text.trim()
      : (r.dosing_preset_id ? (presetText.get(r.dosing_preset_id) ?? "") : "");
    items.push({ id: r.id, product, dosingText, note: r.note, duration: r.duration, orderCode: r.order_code, size: r.size, chosenAlternativeId: r.chosen_alternative_id, position: r.position });
  }
  return { id: base[0].id, patientId: base[0].patient_id, status: base[0].status, items };
}

export async function finalisePlan(planId: number): Promise<void> {
  await execute("UPDATE plans SET status = 'finalised', updated_at = datetime('now') WHERE id = ?", [planId]);
}

// Copy an existing plan's items into a brand-new draft for the SAME patient, so a
// follow-up can be re-prescribed and tweaked without rebuilding. Source is untouched.
export async function duplicatePlan(sourcePlanId: number, authorId?: number): Promise<number> {
  const base = await query<{ patient_id: number }>("SELECT patient_id FROM plans WHERE id = ?", [sourcePlanId]);
  if (!base[0]) throw new Error(`duplicatePlan: source plan ${sourcePlanId} not found`);
  const items = await query<{ product_id: number; dosing_preset_id: number|null; dosing_custom_text: string|null; chosen_alternative_id: number|null; note: string|null; duration: string|null; order_code: string|null; size: string|null; position: number }>(
    `SELECT product_id, dosing_preset_id, dosing_custom_text, chosen_alternative_id, note, duration, order_code, size, position
     FROM plan_items WHERE plan_id = ? ORDER BY position`, [sourcePlanId]
  );
  const rs = await execute("INSERT INTO plans (patient_id, author_id) VALUES (?, ?)", [base[0].patient_id, authorId ?? null]);
  const newId = Number(rs.lastInsertRowid);
  for (const it of items) {
    await execute(
      `INSERT INTO plan_items (plan_id, product_id, dosing_preset_id, dosing_custom_text, chosen_alternative_id, note, duration, order_code, size, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, it.product_id, it.dosing_preset_id, it.dosing_custom_text, it.chosen_alternative_id, it.note, it.duration, it.order_code, it.size, it.position]
    );
  }
  return newId;
}

// Delete a draft plan and everything attached to it (items + any saved guide), in one
// write batch. Leaves the patient, other plans and snapshots alone. UI calls this on drafts.
export async function deletePlan(planId: number): Promise<void> {
  await getDb().batch(
    [
      { sql: "DELETE FROM plan_items WHERE plan_id = ?", args: [planId] },
      { sql: "DELETE FROM plan_guide WHERE plan_id = ?", args: [planId] },
      { sql: "DELETE FROM plans WHERE id = ?", args: [planId] },
    ],
    "write"
  );
}

// Which draft to open in the builder: the requested one if it's a draft of this patient,
// otherwise the patient's default (newest / freshly-created) draft.
export async function resolveDraftPlanId(patientId: number, requestedPlanId?: number, authorId?: number): Promise<number> {
  if (requestedPlanId) {
    const rows = await query<{ id: number }>(
      "SELECT id FROM plans WHERE id = ? AND patient_id = ? AND status = 'draft'", [requestedPlanId, patientId]
    );
    if (rows[0]) return rows[0].id;
  }
  return getOrCreateDraftPlan(patientId, authorId);
}

export async function listDraftPlans(): Promise<{ planId: number; patientId: number; patientName: string; itemCount: number; updatedAt: string; authorName: string|null }[]> {
  return query(
    `SELECT p.id AS planId, p.patient_id AS patientId, pt.name AS patientName,
            (SELECT COUNT(*) FROM plan_items pi WHERE pi.plan_id = p.id) AS itemCount,
            p.updated_at AS updatedAt, u.name AS authorName
     FROM plans p
     JOIN patients pt ON pt.id = p.patient_id
     LEFT JOIN users u ON u.id = p.author_id
     WHERE p.status = 'draft'
     ORDER BY p.updated_at DESC`
  );
}
