import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient } from "@/lib/patients";
import { exportPatientData } from "@/lib/gdpr-export";
import { recordAudit, listAuditForEntity } from "@/lib/audit";

// Mirrors what the route does after requireAdmin(): export + audit.
async function auditedExport(patientId: number, actorId: number) {
  const data = await exportPatientData(patientId);
  if (data.patient) await recordAudit({ actorId, action: "exported", entity: "patient", entityId: patientId, detail: "data export (GDPR)" });
  return data;
}

describe("audited export", () => {
  beforeAll(async () => { await runMigrations(); });
  it("records an 'exported' audit event with no PII", async () => {
    const actor = await createUser({ email: `r${Date.now()}@c.test`, password: "x", role: "admin", name: "R" });
    const pid = await createPatient({ name: "Route P", dob: "1990-01-01", createdBy: actor });
    await auditedExport(pid, actor);
    const audit = await listAuditForEntity("patient", pid);
    const ev = audit.find((a) => a.action === "exported");
    expect(ev).toBeTruthy();
    expect(ev!.detail ?? "").not.toContain("Route P");
  });
});
