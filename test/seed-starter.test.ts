import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { runWithDb, query } from "@/lib/db";
import { runMigrations } from "@/scripts/migrate";
import { seedStarterData } from "@/scripts/seed-starter";

describe("starter seed", () => {
  it("seeds generic dosing presets + note snippets, no brands, idempotently", async () => {
    const db = createClient({ url: ":memory:" });
    await runWithDb(db, async () => {
      await runMigrations();
      await seedStarterData();
      await seedStarterData(); // idempotent
      const presets = await query<{ n: number }>("SELECT COUNT(*) AS n FROM dosing_presets");
      const snippets = await query<{ n: number }>("SELECT COUNT(*) AS n FROM note_snippets");
      const brands = await query<{ n: number }>("SELECT COUNT(*) AS n FROM brands");
      expect(presets[0].n).toBeGreaterThan(0);
      expect(snippets[0].n).toBeGreaterThan(0);
      expect(brands[0].n).toBe(0);
    });
  });
});
