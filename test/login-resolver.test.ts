import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership } from "@/lib/control-users";
import { resolveLogin } from "@/lib/auth/login";

beforeEach(async () => {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
  await upsertTenant({ id: "lorna", name: "Lorna", dbUrl: "file:local.db" });
  const uid = await createControlUser({ email: "l@x.com", password: "pw", name: "Lorna" });
  await addMembership({ userId: uid, tenantId: "lorna", role: "owner", tenantUserId: uid });
});

describe("resolveLogin", () => {
  it("returns a session for valid credentials, owner mapped to admin", async () => {
    const s = await resolveLogin("l@x.com", "pw");
    expect(s).toMatchObject({ tenantId: "lorna", role: "admin", name: "Lorna" });
  });

  it("maps practitioner role to team", async () => {
    const uid = await createControlUser({ email: "p@x.com", password: "pw", name: "Pat" });
    await addMembership({ userId: uid, tenantId: "lorna", role: "practitioner", tenantUserId: uid });
    const s = await resolveLogin("p@x.com", "pw");
    expect(s?.role).toBe("team");
  });

  it("returns null for a wrong password", async () => {
    expect(await resolveLogin("l@x.com", "nope")).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    expect(await resolveLogin("ghost@x.com", "pw")).toBeNull();
  });
});
