import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";

describe("schema", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates all foundation tables", async () => {
    const rows = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = rows.map((r) => r.name);
    for (const t of ["users","brands","products","taxonomy_terms","product_tags","supplier_links","product_alternatives","clinic_settings"]) {
      expect(names).toContain(t);
    }
  });
});
