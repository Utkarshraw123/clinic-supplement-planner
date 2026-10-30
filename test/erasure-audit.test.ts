import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient, deletePatient } from "@/lib/patients";
import { listAuditForEntity } from "@/lib/audit";

describe("right-to-erasure is audited and PII-free", () => {
  beforeAll(async () => { await runMigrations(); });

  it("leaves an 'erased' audit event with no patient PII after deletion", async () => {
    const actor = await createUser({ email: `e${Date.now()}@c.test`, password: "x", role: "admin", name: "E" });
    const pid = await createPatient({ name: "Erase McName", dob: "1988-02-02", createdBy: actor });

    await deletePatient(pid, actor);

    const audit = await listAuditForEntity("patient", pid);
    const erased = audit.find((a) => a.action === "erased");
    expect(erased).toBeTruthy();
    expect(erased!.actor_id).toBe(actor);
    // No name or dob leaked into the surviving audit detail.
    expect(erased!.detail ?? "").not.toContain("Erase McName");
    expect(erased!.detail ?? "").not.toContain("1988-02-02");
  });
});
