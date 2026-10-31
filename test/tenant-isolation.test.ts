import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { runWithDb, query, execute, getActiveDb } from "@/lib/db";

async function makeTenant() {
  const c = createClient({ url: ":memory:" });
  await c.execute("CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT)");
  return c;
}

describe("tenant isolation via active client", () => {
  it("each tenant only sees its own rows", async () => {
    const a = await makeTenant();
    const b = await makeTenant();

    await runWithDb(a, () => execute("INSERT INTO patients (name) VALUES (?)", ["Alice"]));
    await runWithDb(b, () => execute("INSERT INTO patients (name) VALUES (?)", ["Bob"]));

    const aRows = await runWithDb(a, () => query<{ name: string }>("SELECT name FROM patients"));
    const bRows = await runWithDb(b, () => query<{ name: string }>("SELECT name FROM patients"));

    expect(aRows.map((r) => r.name)).toEqual(["Alice"]);
    expect(bRows.map((r) => r.name)).toEqual(["Bob"]);
  });

  it("getActiveDb returns the ALS-scoped client", async () => {
    const a = await makeTenant();
    const resolved = await runWithDb(a, () => getActiveDb());
    expect(resolved).toBe(a);
  });

  it("falls back to the env-default client outside any ALS/session scope", async () => {
    // Existing tests and scripts rely on this: query() works with no active
    // tenant because TURSO_DATABASE_URL (test.db) is set in test/setup.ts.
    await execute("CREATE TABLE IF NOT EXISTS _iso_probe (id INTEGER PRIMARY KEY)");
    await expect(query("SELECT 1 AS one")).resolves.toEqual([{ one: 1 }]);
  });
});
