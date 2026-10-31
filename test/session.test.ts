import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";

describe("session with tenant", () => {
  it("round-trips tenantId", async () => {
    const token = await signSession({ userId: 1, tenantId: "lorna", role: "admin", name: "Lorna" });
    const s = await verifySession(token);
    expect(s).toEqual({ userId: 1, tenantId: "lorna", role: "admin", name: "Lorna" });
  });

  it("rejects a legacy token with no tenantId", async () => {
    // A token signed the old way (no tenantId) must not resolve under the new layer.
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me-32-characters!");
    const legacy = await new SignJWT({ userId: 1, role: "admin", name: "Lorna" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    expect(await verifySession(legacy)).toBeNull();
  });
});
