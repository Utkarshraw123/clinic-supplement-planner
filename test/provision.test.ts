import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb, query } from "@/lib/db";
import { provisionTenant } from "@/lib/tenancy/provision";
import { resolveLogin } from "@/lib/auth/login";

async function resetControl() {
  const db = getControlDb();
  for (const t of ["subscriptions", "memberships", "users", "tenants", "provisioning_jobs"]) await db.execute(`DROP TABLE IF EXISTS ${t}`);
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("provisionTenant", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-prov.db"), { force: true });
    await resetControl();
  });

  it("creates an isolated DB, seeds starter data, and the owner can log in", async () => {
    const out = await provisionTenant(
      { tenantId: "acme", clinicName: "Acme Nutrition", ownerEmail: "o@acme.test", ownerName: "Owner", ownerPassword: "pw" },
      { createDb: async () => ({ url: "file:test-prov.db", authToken: "" }) }
    );
    expect(out.tenantId).toBe("acme");

    // Starter data is present in the new tenant DB.
    const tdb = await getTenantDb("acme");
    const presets = await runWithDb(tdb, () => query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets"));
    expect(presets[0].n).toBeGreaterThan(0);

    // The owner can authenticate and lands on the tenant with a real local user id.
    const session = await resolveLogin("o@acme.test", "pw");
    expect(session?.tenantId).toBe("acme");
    expect(session?.userId).toBe(out.tenantUserId);

    // Job completed.
    const job = await getControlDb().execute("SELECT state FROM provisioning_jobs WHERE tenant_id = 'acme' ORDER BY id DESC LIMIT 1");
    expect(String(job.rows[0].state)).toBe("done");

    const { getSubscription } = await import("@/lib/billing/subscriptions");
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("trialing");
  });

  it("marks the job failed if DB creation throws", async () => {
    await expect(
      provisionTenant(
        { tenantId: "boom", clinicName: "Boom", ownerEmail: "b@x.test", ownerName: "B", ownerPassword: "pw" },
        { createDb: async () => { throw new Error("turso down"); } }
      )
    ).rejects.toThrow("turso down");
    const job = await getControlDb().execute("SELECT state FROM provisioning_jobs WHERE tenant_id = 'boom' ORDER BY id DESC LIMIT 1");
    expect(String(job.rows[0].state)).toBe("failed");
  });
});
