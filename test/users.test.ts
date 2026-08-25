import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser, findUserByEmail } from "@/lib/users";
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
});
