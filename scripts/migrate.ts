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
  await ensureColumn("protocol_items", "note", "TEXT");          // full item fields, so a protocol is the whole plan
  await ensureColumn("protocol_items", "duration", "TEXT");
  await ensureColumn("protocol_items", "order_code", "TEXT");
  await ensureColumn("protocol_items", "size", "TEXT");
  await ensureColumn("protocols", "next_consultation", "TEXT");  // page-2 sections a protocol carries
  await ensureColumn("protocols", "lifestyle", "TEXT");
  await ensureColumn("protocols", "dietary", "TEXT");
  await ensureColumn("protocols", "notes", "TEXT");
  await ensureColumn("dosing_presets", "archived", "INTEGER NOT NULL DEFAULT 0"); // "deleted" presets stay resolvable

  // One-time move of the old single per-brand promo code into the brand's code list as
  // its default, then clear it so deleting codes later never brings it back.
  await execute(
    `INSERT INTO brand_codes (brand_id, code, is_default)
     SELECT b.id, trim(b.promo_code), 1 FROM brands b
     WHERE b.promo_code IS NOT NULL AND trim(b.promo_code) <> ''
       AND NOT EXISTS (SELECT 1 FROM brand_codes bc WHERE bc.brand_id = b.id)`
  );
  await execute(
    `UPDATE brands SET promo_code = NULL
     WHERE promo_code IS NOT NULL AND EXISTS (SELECT 1 FROM brand_codes bc WHERE bc.brand_id = brands.id)`
  );
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => { console.log("migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
