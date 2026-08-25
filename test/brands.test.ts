import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand, listBrands } from "@/lib/brands";

describe("brands", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates and lists brands alphabetically", async () => {
    await createBrand({ name: `Zebra ${Date.now()}` });
    await createBrand({ name: `Acme ${Date.now()}` });
    const all = await listBrands();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const names = all.map((b) => b.name);
    expect([...names]).toEqual([...names].sort());
  });
});
