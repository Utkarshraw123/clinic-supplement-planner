import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb, query } from "@/lib/db";
import { slugify, uniqueTenantSlug } from "@/lib/tenancy/slug";
import { signupClinic } from "@/lib/tenancy/signup";
import { resolveLogin } from "@/lib/auth/login";

async function resetControl() {
  const db = getControlDb();
  for (const t of ["subscriptions", "memberships", "users", "tenants", "provisioning_jobs"]) await db.execute(`DROP TABLE IF EXISTS ${t}`);
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

// Unique file per call so a cached libsql client is never reused against a
// deleted file across tests.
const localCreateDb = (name: string) =>
  Promise.resolve({ url: `file:test-su-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`, authToken: "" });

beforeEach(async () => {
  await resetControl();
});

describe("slugify", () => {
  it("sanitizes a clinic name", () => {
    expect(slugify("Green Valley Nutrition!")).toBe("green-valley-nutrition");
    expect(slugify("A")).toMatch(/^a[a-z0-9-]*$/); // padded to >=3
  });
});

describe("uniqueTenantSlug", () => {
  it("appends a suffix when taken", async () => {
    const { upsertTenant } = await import("@/lib/control-users");
    await upsertTenant({ id: "green-valley", name: "x", dbUrl: "file:x.db" });
    expect(await uniqueTenantSlug("Green Valley")).toBe("green-valley-2");
  });
});

describe("signupClinic", () => {
  it("provisions a clinic the owner can log into", async () => {
    const out = await signupClinic(
      { clinicName: "Green Valley", ownerName: "Dr Green", email: "dr@green.test", password: "pw" },
      { createDb: localCreateDb }
    );
    expect(out.tenantId).toBe("green-valley");
    const session = await resolveLogin("dr@green.test", "pw");
    expect(session?.tenantId).toBe("green-valley");
    expect(session?.userId).toBe(out.tenantUserId);
    const tdb = await getTenantDb("green-valley");
    const presets = await runWithDb(tdb, () => query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets"));
    expect(presets[0].n).toBeGreaterThan(0);
  });

  it("rejects a duplicate email", async () => {
    await signupClinic({ clinicName: "Green Valley", ownerName: "Dr Green", email: "dup@green.test", password: "pw" }, { createDb: localCreateDb });
    await expect(
      signupClinic({ clinicName: "Green Valley Two", ownerName: "Dr Two", email: "dup@green.test", password: "pw" }, { createDb: localCreateDb })
    ).rejects.toMatchObject({ code: "email_taken" });
  });
});
