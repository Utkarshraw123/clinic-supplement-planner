import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession, verifySession } from "@/lib/auth/session";

describe("password", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("session", () => {
  it("round-trips a payload", async () => {
    const token = await signSession({ userId: 7, role: "admin", name: "Lorna" });
    const decoded = await verifySession(token);
    expect(decoded).toEqual({ userId: 7, role: "admin", name: "Lorna" });
  });
  it("rejects a tampered token", async () => {
    expect(await verifySession("not.a.jwt")).toBeNull();
  });
});
