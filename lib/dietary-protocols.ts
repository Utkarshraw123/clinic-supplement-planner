import { query, execute } from "@/lib/db";

export type DietaryProtocol = { id: number; name: string; body: string };

export async function listDietaryProtocols(): Promise<DietaryProtocol[]> {
  return query<DietaryProtocol>("SELECT id, name, body FROM dietary_protocols ORDER BY name");
}

const cleanBody = (b: string) => b.replace(/\r\n/g, "\n").trim();

export async function createDietaryProtocol(name: string, body: string, createdBy?: number): Promise<number | null> {
  const n = name.trim(), b = cleanBody(body);
  if (!n || !b) return null;
  const rs = await execute("INSERT INTO dietary_protocols (name, body, created_by) VALUES (?, ?, ?)", [n, b, createdBy ?? null]);
  return Number(rs.lastInsertRowid);
}

export async function updateDietaryProtocol(id: number, name: string, body: string): Promise<void> {
  const n = name.trim(), b = cleanBody(body);
  if (!n || !b) return;
  await execute("UPDATE dietary_protocols SET name = ?, body = ? WHERE id = ?", [n, b, id]);
}

// Inserted text is copied into the plan, so deleting a template never changes a plan.
export async function deleteDietaryProtocol(id: number): Promise<void> {
  await execute("DELETE FROM dietary_protocols WHERE id = ?", [id]);
}
