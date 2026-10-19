import { query, execute } from "@/lib/db";

export type DosingPreset = { id: number; label: string; text: string };

// Active presets, as offered in the plan and protocol builders.
export async function listDosingPresets(): Promise<DosingPreset[]> {
  return query<DosingPreset>("SELECT id, label, text FROM dosing_presets WHERE archived = 0 ORDER BY label");
}

export async function createDosingPreset(label: string, text: string): Promise<number | null> {
  const l = label.trim(), t = text.trim();
  if (!l || !t) return null;
  const rs = await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [l, t]);
  return Number(rs.lastInsertRowid);
}

export async function updateDosingPreset(id: number, label: string, text: string): Promise<void> {
  const l = label.trim(), t = text.trim();
  if (!l || !t) return;
  await execute("UPDATE dosing_presets SET label = ?, text = ? WHERE id = ?", [l, t, id]);
}

// "Delete" hides a preset from every picker but keeps the row: plan items reference
// presets by id and resolve the wording at render time, so a hard delete would blank
// the dosing on drafts that use it.
export async function archiveDosingPreset(id: number): Promise<void> {
  await execute("UPDATE dosing_presets SET archived = 1 WHERE id = ?", [id]);
}
