import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser, findUserByEmail, getUserById, updateUserPassword } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";

describe("users", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates a user with a hashed password and finds by email", async () => {
    const email = `t${Date.now()}@clinic.test`;
    await createUser({ email, password: "pw123456", role: "team", name: "Test" });
    const u = await findUserByEmail(email);
    expect(u).not.toBeNull();
    expect(u!.role).toBe("team");
    expect(u!.password_hash).not.toBe("pw123456");
    expect(await verifyPassword("pw123456", u!.password_hash)).toBe(true);
  });

  it("finds a user by id", async () => {
    const email = `id${Date.now()}@clinic.test`;
    const id = await createUser({ email, password: "pw123456", role: "admin", name: "By Id" });
    const u = await getUserById(id);
    expect(u).not.toBeNull();
    expect(u!.email).toBe(email);
    expect(u!.role).toBe("admin");
    expect(await getUserById(999999)).toBeNull();
  });

  it("updates a password: the old one stops working and the new one verifies", async () => {
    const email = `pw${Date.now()}@clinic.test`;
    const id = await createUser({ email, password: "old-password-1", role: "team", name: "PW" });
    await updateUserPassword(id, "brand-new-password-2");
    const u = await getUserById(id);
    expect(await verifyPassword("old-password-1", u!.password_hash)).toBe(false);
    expect(await verifyPassword("brand-new-password-2", u!.password_hash)).toBe(true);
  });
});
