import { randomBytes, createHash } from "node:crypto";
import { query, execute } from "@/lib/db";
import { findPatientByEmail } from "@/lib/patients";

const TTL_MS = 30 * 60 * 1000;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPortalLoginToken(email: string): Promise<{ token: string; patientId: number } | null> {
  const patient = await findPatientByEmail(email);
  if (!patient) return null;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  await execute("INSERT INTO portal_login_tokens (patient_id, token_hash, expires_at) VALUES (?, ?, ?)", [patient.id, hash(token), expires]);
  return { token, patientId: patient.id };
}

export async function consumePortalLoginToken(token: string, now: Date = new Date()): Promise<number | null> {
  const rows = await query<{ id: number; patient_id: number; expires_at: string; used_at: string | null }>(
    "SELECT id, patient_id, expires_at, used_at FROM portal_login_tokens WHERE token_hash = ?",
    [hash(token)]
  );
  const row = rows[0];
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null;
  await execute("UPDATE portal_login_tokens SET used_at = datetime('now') WHERE id = ?", [row.id]);
  return row.patient_id;
}
