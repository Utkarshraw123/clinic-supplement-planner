import { describe, it, expect, beforeAll } from "vitest";
import { execute, query } from "@/lib/db";

describe("db layer", () => {
  beforeAll(async () => {
    await execute("CREATE TABLE IF NOT EXISTS _probe (id INTEGER PRIMARY KEY, name TEXT)");
    await execute("DELETE FROM _probe");
  });
  it("executes parameterised writes and reads", async () => {
    await execute("INSERT INTO _probe (name) VALUES (?)", ["hello"]);
    const rows = await query<{ name: string }>("SELECT name FROM _probe WHERE name = ?", ["hello"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("hello");
  });
});
