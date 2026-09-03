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
  await ensureColumn("products", "description", "TEXT");
  await ensureColumn("plan_items", "note", "TEXT");          // per-product practitioner comment
  await ensureColumn("plan_items", "duration", "TEXT");      // per-item course length (e.g. "3 months")
  await ensureColumn("plan_items", "order_code", "TEXT");    // per-item discount / coupon code (overrides brand promo)
  await ensureColumn("plan_items", "size", "TEXT");          // per-item pack size (e.g. "60 capsules")
  await ensureColumn("brands", "promo_code", "TEXT");        // one promo code per brand, applied to all its products
  await ensureColumn("plan_guide", "notes", "TEXT");         // closing notes block on the prescription
  await ensureColumn("note_snippets", "category", "TEXT");   // supplement | lifestyle | dietary | general
  await ensureColumn("clinic_settings", "letterhead_template", "TEXT"); // prescription PDF colourway (see lib/pdf-themes.ts)
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => { console.log("migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
