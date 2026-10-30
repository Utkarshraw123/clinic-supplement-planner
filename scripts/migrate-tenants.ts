import { runControlMigrations } from "./migrate-control";
import { runMigrations } from "./migrate";
import { getTenantDb, runWithDb } from "../lib/db";
import { listTenants } from "../lib/control-users";

// Apply control-plane migrations, then the clinical schema to EVERY tenant DB.
// Idempotent: runMigrations uses CREATE TABLE IF NOT EXISTS + guarded ALTERs.
export async function runAllTenantMigrations(): Promise<{ control: true; tenants: string[] }> {
  await runControlMigrations();
  const tenants = await listTenants();
  const done: string[] = [];
  for (const t of tenants) {
    const client = await getTenantDb(t.id);
    await runWithDb(client, () => runMigrations());
    done.push(t.id);
  }
  return { control: true, tenants: done };
}

if (process.argv[1] && process.argv[1].endsWith("migrate-tenants.ts")) {
  runAllTenantMigrations()
    .then((r) => { console.log(`migrated control + ${r.tenants.length} tenant(s): ${r.tenants.join(", ")}`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
