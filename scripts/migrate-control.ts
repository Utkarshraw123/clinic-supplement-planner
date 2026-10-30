import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "../lib/db";

// Apply the control-plane schema (idempotent; uses CREATE TABLE IF NOT EXISTS).
export async function runControlMigrations(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  const db = getControlDb();
  for (const stmt of statements) await db.execute(stmt);

  // Guarded column add for control DBs created before the identity bridge.
  const cols = await db.execute("PRAGMA table_info(memberships)");
  if (!cols.rows.some((c) => String((c as Record<string, unknown>).name) === "tenant_user_id")) {
    await db.execute("ALTER TABLE memberships ADD COLUMN tenant_user_id INTEGER NOT NULL DEFAULT 0");
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate-control.ts")) {
  runControlMigrations()
    .then(() => { console.log("control migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
