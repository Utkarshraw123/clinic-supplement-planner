import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { recordConsent, withdrawConsent, latestConsentByPurpose } from "@/lib/consent";
import { CONSENT_PURPOSES } from "@/app/patients/[id]/consent-config";

describe("consent purposes + state", () => {
  beforeAll(async () => { await runMigrations(); });

  it("exposes the two purposes and reflects grant/withdraw state", async () => {
    expect(CONSENT_PURPOSES.map((p) => p.key)).toContain("health_data_processing");
    const pid = await createPatient({ name: "Consent UI", dob: "1990-01-01" });
    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1" });
    expect((await latestConsentByPurpose(pid))["health_data_processing"].granted).toBe(1);
    await withdrawConsent({ patientId: pid, purpose: "health_data_processing" });
    expect((await latestConsentByPurpose(pid))["health_data_processing"].granted).toBe(0);
  });
});
