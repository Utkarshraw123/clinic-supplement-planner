import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { startTrial, upsertSubscription } from "@/lib/billing/subscriptions";
import { checkTenantAccess } from "@/lib/billing/gate";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
  await upsertTenant({ id: "acme", name: "Acme", dbUrl: "file:unused.db" });
  await upsertTenant({ id: "ghost", name: "Ghost", dbUrl: "file:unused2.db" });
}
beforeEach(resetControl);

describe("checkTenantAccess", () => {
  it("allows a fresh trial, blocks a tenant with no subscription", async () => {
    expect((await checkTenantAccess("ghost")).allowed).toBe(false);
    await startTrial("acme");
    expect((await checkTenantAccess("acme")).allowed).toBe(true);
  });
  it("blocks a canceled tenant", async () => {
    await upsertSubscription({ tenant_id: "acme", status: "canceled" });
    expect((await checkTenantAccess("acme")).allowed).toBe(false);
  });
});
