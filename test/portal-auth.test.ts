import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createPortalLoginToken, consumePortalLoginToken } from "@/lib/portal";
import { signPortalSession, verifyPortalSession } from "@/lib/auth/portal-session";

describe("portal auth", () => {
  beforeAll(async () => { await runMigrations(); });

  it("issues a single-use token tied to a patient by email", async () => {
    const pid = await createPatient({ name: "Portal P", dob: "1990-01-01", email: "portal@x.test" });
    expect(await createPortalLoginToken("nobody@x.test")).toBeNull();

    const issued = await createPortalLoginToken("portal@x.test");
    expect(issued?.patientId).toBe(pid);

    expect(await consumePortalLoginToken(issued!.token)).toBe(pid);
    expect(await consumePortalLoginToken(issued!.token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const pid = await createPatient({ name: "Exp P", dob: "1990-01-01", email: "exp@x.test" });
    const issued = await createPortalLoginToken("exp@x.test");
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(await consumePortalLoginToken(issued!.token, future)).toBeNull();
    expect(pid).toBeGreaterThan(0);
  });

  it("round-trips a portal session", async () => {
    const token = await signPortalSession({ tenantId: "t1", patientId: 5 });
    expect(await verifyPortalSession(token)).toEqual({ tenantId: "t1", patientId: 5 });
  });
});
