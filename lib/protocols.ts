import { query, execute } from "@/lib/db";
import { addPlanItem, setItemDosing, setItemNote, setItemDuration, setItemSize, setItemOrderCodeStored, dosingTextFor } from "@/lib/plans";
import { getPlanGuide, savePlanGuide } from "@/lib/guide";
import { mergeSection } from "@/lib/text-merge";

export type ProtocolSummary = { id: number; name: string; description: string | null; itemCount: number };
export type ProtocolItem = {
  itemId: number; productId: number; productName: string; brandName: string;
  dosingPresetId: number | null; dosingCustomText: string | null; dosingText: string;
  note: string | null; duration: string | null; orderCode: string | null; size: string | null;
};
// Page-2 text a protocol carries. The personal intro, medications and consultation date
// are deliberately excluded — they belong to each patient.
export type ProtocolSections = {
  nextConsultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null;
};
export type ProtocolDetail = ProtocolSections & {
  id: number; name: string; description: string | null; items: ProtocolItem[];
};

// --- Build a protocol from scratch (standalone, no patient needed) ---

export async function createProtocol(name: string, description: string | null, createdBy?: number): Promise<number> {
  const rs = await execute(
    "INSERT INTO protocols (name, description, created_by) VALUES (?, ?, ?)",
    [name.trim(), description?.trim() || null, createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updateProtocolMeta(id: number, name: string, description: string | null): Promise<void> {
  await execute("UPDATE protocols SET name = ?, description = ? WHERE id = ?", [name.trim(), description?.trim() || null, id]);
}

export async function addProtocolItem(protocolId: number, productId: number): Promise<number> {
  const pos = await query<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM protocol_items WHERE protocol_id = ?", [protocolId]);
  const rs = await execute(
    "INSERT INTO protocol_items (protocol_id, product_id, position) VALUES (?, ?, ?)",
    [protocolId, productId, pos[0].n]
  );
  return Number(rs.lastInsertRowid);
}

export async function removeProtocolItem(itemId: number): Promise<void> {
  await execute("DELETE FROM protocol_items WHERE id = ?", [itemId]);
}

export async function setProtocolItemDosing(itemId: number, presetId: number | null, customText: string | null): Promise<void> {
  await execute("UPDATE protocol_items SET dosing_preset_id = ?, dosing_custom_text = ? WHERE id = ?", [presetId, customText, itemId]);
}

export async function updateProtocolSections(id: number, s: ProtocolSections): Promise<void> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  await execute(
    "UPDATE protocols SET next_consultation = ?, lifestyle = ?, dietary = ?, notes = ? WHERE id = ?",
    [clean(s.nextConsultation), clean(s.lifestyle), clean(s.dietary), clean(s.notes), id]
  );
}

export async function savePlanAsProtocol(planId: number, name: string, description: string | null, createdBy?: number): Promise<number> {
  const guide = await getPlanGuide(planId);
  const rs = await execute(
    `INSERT INTO protocols (name, description, created_by, next_consultation, lifestyle, dietary, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name.trim(), description?.trim() || null, createdBy ?? null,
     guide?.nextConsultation ?? null, guide?.lifestyle ?? null, guide?.dietary ?? null, guide?.notes ?? null]
  );
  const protocolId = Number(rs.lastInsertRowid);
  const items = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null; position: number }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size, position FROM plan_items WHERE plan_id = ? ORDER BY position",
    [planId]
  );
  for (const it of items) {
    await execute(
      `INSERT INTO protocol_items (protocol_id, product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [protocolId, it.product_id, it.dosing_preset_id, it.dosing_custom_text, it.note, it.duration, it.order_code, it.size, it.position]
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
  const base = await query<{ id: number; name: string; description: string | null; next_consultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null }>(
    "SELECT id, name, description, next_consultation, lifestyle, dietary, notes FROM protocols WHERE id = ?", [id]
  );
  if (!base[0]) return null;
  const rows = await query<{ item_id: number; product_id: number; product_name: string; brand_name: string; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null }>(
    `SELECT pi.id AS item_id, pi.product_id, pr.name AS product_name, b.name AS brand_name, pi.dosing_preset_id, pi.dosing_custom_text,
            pi.note, pi.duration, pi.order_code, pi.size
     FROM protocol_items pi JOIN products pr ON pr.id = pi.product_id JOIN brands b ON b.id = pr.brand_id
     WHERE pi.protocol_id = ? ORDER BY pi.position`, [id]
  );
  const items: ProtocolItem[] = [];
  for (const r of rows) {
    items.push({
      itemId: r.item_id, productId: r.product_id, productName: r.product_name, brandName: r.brand_name,
      dosingPresetId: r.dosing_preset_id, dosingCustomText: r.dosing_custom_text,
      dosingText: await dosingTextFor(r.dosing_preset_id, r.dosing_custom_text),
      note: r.note, duration: r.duration, orderCode: r.order_code, size: r.size,
    });
  }
  const b = base[0];
  return {
    id: b.id, name: b.name, description: b.description, items,
    nextConsultation: b.next_consultation, lifestyle: b.lifestyle, dietary: b.dietary, notes: b.notes,
  };
}

export async function applyProtocolToPlan(protocolId: number, planId: number): Promise<number> {
  const rows = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size FROM protocol_items WHERE protocol_id = ? ORDER BY position",
    [protocolId]
  );
  let added = 0;
  for (const r of rows) {
    const itemId = await addPlanItem(planId, r.product_id);
    if (r.dosing_preset_id || r.dosing_custom_text) await setItemDosing(itemId, r.dosing_preset_id, r.dosing_custom_text);
    if (r.note) await setItemNote(itemId, r.note);
    if (r.duration) await setItemDuration(itemId, r.duration);
    if (r.size) await setItemSize(itemId, r.size);
    if (r.order_code !== null) await setItemOrderCodeStored(itemId, r.order_code);
    added++;
  }

  // Page 2: fill empty sections, append under ones that already have text. The intro,
  // medications and consultation date are never touched.
  const sec = await query<{ next_consultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null }>(
    "SELECT next_consultation, lifestyle, dietary, notes FROM protocols WHERE id = ?", [protocolId]
  );
  const p = sec[0];
  if (p && (p.next_consultation || p.lifestyle || p.dietary || p.notes)) {
    const g = (await getPlanGuide(planId)) ?? {
      consultationDate: null, intro: null, nextConsultation: null, lifestyle: null,
      dietary: null, supplementText: null, medsText: null, notes: null,
    };
    const orNull = (s: string) => (s ? s : null);
    await savePlanGuide(planId, {
      ...g,
      nextConsultation: orNull(mergeSection(g.nextConsultation, p.next_consultation)),
      lifestyle: orNull(mergeSection(g.lifestyle, p.lifestyle)),
      dietary: orNull(mergeSection(g.dietary, p.dietary)),
      notes: orNull(mergeSection(g.notes, p.notes)),
    });
  }
  return added;
}

export async function deleteProtocol(id: number): Promise<void> {
  await execute("DELETE FROM protocols WHERE id = ?", [id]);
}
