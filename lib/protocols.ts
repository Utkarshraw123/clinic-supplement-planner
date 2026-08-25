import { query, execute } from "@/lib/db";
import { addPlanItem, setItemDosing, dosingTextFor } from "@/lib/plans";

export type ProtocolSummary = { id: number; name: string; description: string | null; itemCount: number };
export type ProtocolDetail = {
  id: number; name: string; description: string | null;
  items: { productId: number; productName: string; dosingText: string }[];
};

export async function savePlanAsProtocol(planId: number, name: string, description: string | null, createdBy?: number): Promise<number> {
  const rs = await execute(
    "INSERT INTO protocols (name, description, created_by) VALUES (?, ?, ?)",
    [name.trim(), description?.trim() || null, createdBy ?? null]
  );
  const protocolId = Number(rs.lastInsertRowid);
  const items = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null; position: number }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text, position FROM plan_items WHERE plan_id = ? ORDER BY position",
    [planId]
  );
  for (const it of items) {
    await execute(
      "INSERT INTO protocol_items (protocol_id, product_id, dosing_preset_id, dosing_custom_text, position) VALUES (?, ?, ?, ?, ?)",
      [protocolId, it.product_id, it.dosing_preset_id, it.dosing_custom_text, it.position]
    );
  }
  return protocolId;
}

export async function listProtocols(): Promise<ProtocolSummary[]> {
  return query<ProtocolSummary>(
    `SELECT p.id, p.name, p.description, COUNT(pi.id) AS itemCount
     FROM protocols p LEFT JOIN protocol_items pi ON pi.protocol_id = p.id
     GROUP BY p.id ORDER BY p.name`
  );
}

export async function getProtocol(id: number): Promise<ProtocolDetail | null> {
  const base = await query<{ id: number; name: string; description: string | null }>(
    "SELECT id, name, description FROM protocols WHERE id = ?", [id]
  );
  if (!base[0]) return null;
  const rows = await query<{ product_id: number; product_name: string; dosing_preset_id: number | null; dosing_custom_text: string | null }>(
    `SELECT pi.product_id, pr.name AS product_name, pi.dosing_preset_id, pi.dosing_custom_text
     FROM protocol_items pi JOIN products pr ON pr.id = pi.product_id
     WHERE pi.protocol_id = ? ORDER BY pi.position`, [id]
  );
  const items = [];
  for (const r of rows) {
    items.push({ productId: r.product_id, productName: r.product_name, dosingText: await dosingTextFor(r.dosing_preset_id, r.dosing_custom_text) });
  }
  return { ...base[0], items };
}

export async function applyProtocolToPlan(protocolId: number, planId: number): Promise<number> {
  const rows = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text FROM protocol_items WHERE protocol_id = ? ORDER BY position",
    [protocolId]
  );
  let added = 0;
  for (const r of rows) {
    const itemId = await addPlanItem(planId, r.product_id);
    if (r.dosing_preset_id || r.dosing_custom_text) await setItemDosing(itemId, r.dosing_preset_id, r.dosing_custom_text);
    added++;
  }
  return added;
}

export async function deleteProtocol(id: number): Promise<void> {
  await execute("DELETE FROM protocols WHERE id = ?", [id]);
}
