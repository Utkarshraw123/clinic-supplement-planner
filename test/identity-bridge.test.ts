import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership } from "@/lib/control-users";
import { resolveLogin } from "@/lib/auth/login";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

describe("identity bridge", () => {
  beforeEach(async () => {
    rmSync(join(process.cwd(), "test-tenant-id.db"), { force: true });
    await resetControl();
  });

  it("resolveLogin returns the tenant-local user id, not the control id", async () => {
    await upsertTenant({ id: "tid", name: "T", dbUrl: "file:test-tenant-id.db" });
    // Create a tenant-local user first so its id differs from the control id.
    const tenantClient = await getTenantDb("tid");
    const localId = await runWithDb(tenantClient, async () => {
      await runMigrations();
      await createUser({ email: "filler@x.com", password: "x", role: "team", name: "Filler" }); // id 1
      return createUser({ email: "owner@x.com", password: "x", role: "admin", name: "Owner" }); // id 2
    });
    const controlId = await createControlUser({ email: "owner@x.com", password: "pw", name: "Owner" }); // id 1 in control
    await addMembership({ userId: controlId, tenantId: "tid", role: "owner", tenantUserId: localId });

    const session = await resolveLogin("owner@x.com", "pw");
    expect(session?.userId).toBe(localId);      // tenant-local (2), the id tenant tables expect
    expect(localId).not.toBe(controlId);        // guard: the ids genuinely differ
  });
});
