import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser, listUsers, deleteUser } from "@/lib/users";

describe("user admin helpers", () => {
  beforeAll(async () => { await runMigrations(); });
  it("lists then removes a user", async () => {
    const id = await createUser({ email: `del${Date.now()}@c.test`, password: "pw123456", role: "team", name: "Del" });
    const before = await listUsers();
    expect(before.some((u) => u.id === id)).toBe(true);
    await deleteUser(id);
    const after = await listUsers();
    expect(after.some((u) => u.id === id)).toBe(false);
  });
});
