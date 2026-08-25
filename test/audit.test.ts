import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { recordAudit, listAuditForEntity } from "@/lib/audit";

describe("audit", () => {
  beforeAll(async () => { await runMigrations(); });
  it("records and lists events for an entity", async () => {
    const id = Date.now() % 1000000;
    await recordAudit({ action: "finalised", entity: "plan", entityId: id, detail: "2 items" });
    const events = await listAuditForEntity("plan", id);
    expect(events[0].action).toBe("finalised");
    expect(events[0].detail).toBe("2 items");
  });
});
