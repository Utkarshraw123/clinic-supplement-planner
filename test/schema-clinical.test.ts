import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";

describe("clinical schema", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates all clinical tables", async () => {
    const rows = await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    const names = rows.map((r) => r.name);
    for (const t of ["patients","patient_attributes","dosing_presets","plans","plan_items","plan_snapshots","audit_events"]) {
      expect(names).toContain(t);
    }
  });
});
