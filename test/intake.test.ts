import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { getIntake, saveIntake } from "@/lib/intake";
import { listAuditForEntity } from "@/lib/audit";

describe("patient intake", () => {
  beforeAll(async () => { await runMigrations(); });

  it("upserts a single intake row, reads it back, and audits (PII-free)", async () => {
    const pid = await createPatient({ name: "Intake P", dob: "1990-01-01" });
    expect(await getIntake(pid)).toBeNull();

    await saveIntake(pid, { chiefConcern: "Fatigue", goals: "More energy", currentMedications: "Levothyroxine", updatedBy: 1 });
    let i = await getIntake(pid);
    expect(i?.chief_concern).toBe("Fatigue");
    expect(i?.current_medications).toBe("Levothyroxine");

    await saveIntake(pid, { chiefConcern: "Fatigue and poor sleep", goals: "More energy", updatedBy: 1 });
    i = await getIntake(pid);
    expect(i?.chief_concern).toBe("Fatigue and poor sleep");
    expect(i?.current_medications).toBeNull(); // not re-supplied → cleared on full save

    const audit = await listAuditForEntity("patient", pid);
    expect(audit.map((a) => a.action)).toContain("intake_updated");
    expect(audit.map((a) => a.detail ?? "").join(" ")).not.toContain("Levothyroxine");
  });

  it("deletePatient removes the intake", async () => {
    const pid = await createPatient({ name: "Erase Intake", dob: "1990-01-01" });
    await saveIntake(pid, { chiefConcern: "x" });
    await deletePatient(pid, 1);
    expect(await getIntake(pid)).toBeNull();
  });
});
