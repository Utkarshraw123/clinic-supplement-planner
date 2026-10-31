import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = { TURSO_PLATFORM_TOKEN: "tok", TURSO_ORG: "acme", TURSO_GROUP: "default" };

describe("turso platform client", () => {
  beforeEach(() => { Object.assign(process.env, ENV); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("creates a database then mints a token, returning the libsql url", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if (url.endsWith("/databases")) {
        return new Response(JSON.stringify({ database: { Hostname: "clinic-x-acme.turso.io" } }), { status: 200 });
      }
      if (url.endsWith("/auth/tokens")) {
        return new Response(JSON.stringify({ jwt: "db-jwt" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));
    const { createTursoDatabase } = await import("@/lib/tenancy/turso");
    const out = await createTursoDatabase("clinic-x");
    expect(out.url).toBe("libsql://clinic-x-acme.turso.io");
    expect(out.authToken).toBe("db-jwt");
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/databases"))).toBe(true);
  });
});
