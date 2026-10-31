import { createTursoDatabase } from "@/lib/tenancy/turso";

// Real Turso when configured; a local file DB otherwise (so dev signup works
// with no token). Signature matches createTursoDatabase.
export function resolveCreateDb(): (name: string) => Promise<{ url: string; authToken: string }> {
  if (process.env.TURSO_PLATFORM_TOKEN && process.env.TURSO_ORG) return createTursoDatabase;
  return async (name: string) => ({ url: `file:tenant-${name}.db`, authToken: "" });
}
