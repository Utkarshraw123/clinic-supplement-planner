import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execute } from "../lib/db";

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "lib/schema.sql"), "utf8");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await execute(stmt);
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => { console.log("migrations applied"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
