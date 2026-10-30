import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient } from "@/lib/patients";
import { recordConsent, withdrawConsent, listConsents, latestConsentByPurpose } from "@/lib/consent";
import { listAuditForEntity } from "@/lib/audit";

describe("patient consent (versioned, withdrawable)", () => {
  beforeAll(async () => { await runMigrations(); });

  it("records grant then withdrawal as separate rows, latest wins, and audits both", async () => {
    const actor = await createUser({ email: `c${Date.now()}@c.test`, password: "x", role: "admin", name: "C" });
    const pid = await createPatient({ name: "Consent P", dob: "1990-01-01", createdBy: actor });

    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1", actorId: actor });
    await withdrawConsent({ patientId: pid, purpose: "health_data_processing", actorId: actor });

    const history = await listConsents(pid);
    expect(history).toHaveLength(2);
    expect(history[0].granted).toBe(0); // newest first = the withdrawal

    const latest = await latestConsentByPurpose(pid);
    expect(latest["health_data_processing"].granted).toBe(0);

    const audit = await listAuditForEntity("patient", pid);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain("consent_granted");
    expect(actions).toContain("consent_withdrawn");
  });
});
