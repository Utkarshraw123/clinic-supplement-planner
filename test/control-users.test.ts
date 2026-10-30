import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import {
  createControlUser,
  findControlUserByEmail,
  addMembership,
  findPrimaryMembership,
  upsertTenant,
} from "@/lib/control-users";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS memberships");
  await db.execute("DROP TABLE IF EXISTS users");
  await db.execute("DROP TABLE IF EXISTS tenants");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

beforeEach(resetControl);

describe("control-plane identity", () => {
  it("creates a user, tenant, membership and resolves them", async () => {
    await upsertTenant({ id: "lorna", name: "Lorna Clinic", dbUrl: "file:local.db" });
    const uid = await createControlUser({ email: "L@x.com", password: "pw", name: "Lorna" });
    await addMembership({ userId: uid, tenantId: "lorna", role: "owner", tenantUserId: 7 });

    const found = await findControlUserByEmail("l@x.com"); // case-insensitive
    expect(found?.id).toBe(uid);

    const m = await findPrimaryMembership(uid);
    expect(m).toEqual({ tenant_id: "lorna", role: "owner", tenant_user_id: 7 });
  });

  it("upsertTenant updates an existing row, addMembership updates the role", async () => {
    await upsertTenant({ id: "lorna", name: "Old", dbUrl: "file:old.db" });
    await upsertTenant({ id: "lorna", name: "New", dbUrl: "file:new.db" });
    const uid = await createControlUser({ email: "a@x.com", password: "pw", name: "A" });
    await addMembership({ userId: uid, tenantId: "lorna", role: "practitioner", tenantUserId: 1 });
    await addMembership({ userId: uid, tenantId: "lorna", role: "admin", tenantUserId: 1 });
    expect((await findPrimaryMembership(uid))?.role).toBe("admin");
  });

  it("returns null for unknown email and user with no membership", async () => {
    expect(await findControlUserByEmail("ghost@x.com")).toBeNull();
    const uid = await createControlUser({ email: "b@x.com", password: "pw", name: "B" });
    expect(await findPrimaryMembership(uid)).toBeNull();
  });
});
