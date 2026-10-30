import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("control-plane schema", () => {
  it("creates tenants, users and memberships tables", async () => {
    const db = createClient({ url: ":memory:" });
    const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(stmt);
    }
    const tables = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.rows.map((r) => String(r.name));
    expect(names).toContain("tenants");
    expect(names).toContain("users");
    expect(names).toContain("memberships");
  });
});
