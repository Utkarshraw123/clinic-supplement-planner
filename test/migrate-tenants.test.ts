import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { getControlDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { runAllTenantMigrations } from "@/scripts/migrate-tenants";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("tenant-aware migration runner", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-tenant-a.db"), { force: true });
    rmSync(join(process.cwd(), "test-tenant-b.db"), { force: true });
    await resetControl();
  });

  it("applies the clinical schema to every registered tenant database", async () => {
    await upsertTenant({ id: "ta", name: "A", dbUrl: "file:test-tenant-a.db" });
    await upsertTenant({ id: "tb", name: "B", dbUrl: "file:test-tenant-b.db" });

    const result = await runAllTenantMigrations();
    expect(result.tenants.sort()).toEqual(["ta", "tb"]);

    for (const f of ["test-tenant-a.db", "test-tenant-b.db"]) {
      const db = createClient({ url: `file:${f}` });
      const t = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'");
      expect(t.rows).toHaveLength(1);
      const c = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='patient_consents'");
      expect(c.rows).toHaveLength(1); // proves the FULL current schema ran, not a stale subset
    }
  });
});
