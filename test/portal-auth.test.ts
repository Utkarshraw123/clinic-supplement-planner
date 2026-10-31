import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createPortalLoginToken, consumePortalLoginToken } from "@/lib/portal";
import { signPortalSession, verifyPortalSession } from "@/lib/auth/portal-session";

describe("portal auth", () => {
  beforeAll(async () => { await runMigrations(); });

  it("issues a single-use token tied to a patient by email", async () => {
    const email = `portal${Date.now()}@x.test`;
    const pid = await createPatient({ name: "Portal P", dob: "1990-01-01", email });
    expect(await createPortalLoginToken("nobody-does-not-exist@x.test")).toBeNull();

    const issued = await createPortalLoginToken(email);
    expect(issued?.patientId).toBe(pid);

    expect(await consumePortalLoginToken(issued!.token)).toBe(pid);
    expect(await consumePortalLoginToken(issued!.token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const email = `exp${Date.now()}@x.test`;
    const pid = await createPatient({ name: "Exp P", dob: "1990-01-01", email });
    const issued = await createPortalLoginToken(email);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(await consumePortalLoginToken(issued!.token, future)).toBeNull();
    expect(pid).toBeGreaterThan(0);
  });

  it("round-trips a portal session", async () => {
    const token = await signPortalSession({ tenantId: "t1", patientId: 5 });
    expect(await verifyPortalSession(token)).toEqual({ tenantId: "t1", patientId: 5 });
  });
});
