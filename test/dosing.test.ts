import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { listDosingPresets, createDosingPreset, updateDosingPreset, archiveDosingPreset } from "@/lib/dosing";
import { dosingTextFor } from "@/lib/plans";

describe("dosing presets", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists and edits a preset (trimmed)", async () => {
    const id = (await createDosingPreset(`  Zz test ${Date.now()} `, " 2 capsules at bedtime "))!;
    let p = (await listDosingPresets()).find((x) => x.id === id)!;
    expect(p.text).toBe("2 capsules at bedtime");
    await updateDosingPreset(id, p.label, "3 capsules at bedtime");
    p = (await listDosingPresets()).find((x) => x.id === id)!;
    expect(p.text).toBe("3 capsules at bedtime");
  });

  it("rejects an empty label or wording", async () => {
    expect(await createDosingPreset("", "x")).toBeNull();
    expect(await createDosingPreset("x", "  ")).toBeNull();
  });

  it("archiving hides a preset from the list but its wording still resolves for existing items", async () => {
    const id = (await createDosingPreset(`Archive me ${Date.now()}`, "1 sachet in water"))!;
    await archiveDosingPreset(id);
    expect((await listDosingPresets()).some((x) => x.id === id)).toBe(false);
    expect(await dosingTextFor(id, null)).toBe("1 sachet in water");
  });
});
