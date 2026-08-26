import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execute, query } from "../lib/db";

// Add a column to an existing table only if it isn't already there. CREATE TABLE
// IF NOT EXISTS never alters an existing table, so evolving columns need this.
async function ensureColumn(table: string, column: string, type: string): Promise<void> {
  const cols = await query<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "lib/schema.sql"), "utf8");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await execute(stmt);

  // Idempotent column additions for tables that predate a column.
  await ensureColumn("products", "default_note", "TEXT");
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => { console.log("migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
