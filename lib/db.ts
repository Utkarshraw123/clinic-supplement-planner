import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/session";

// One libSQL client per (url, token). Cached so we reuse connections across the
// control-plane and every tenant database.
const _clients = new Map<string, Client>();
function client(url: string, authToken?: string): Client {
  const key = `${url}::${authToken ?? ""}`;
  let c = _clients.get(key);
  if (!c) {
    c = createClient({ url, authToken });
    _clients.set(key, c);
  }
  return c;
}

// The env-configured single database (legacy default: scripts, seeds, tests, and
// the dev fallback before a tenant session exists).
export function getDb(): Client {
  const url = process.env.TURSO_DATABASE_URL || "file:local.db";
  return client(url, process.env.TURSO_AUTH_TOKEN || undefined);
}

// The shared control-plane database (tenant registry + global identity).
export function getControlDb(): Client {
  const url = process.env.CONTROL_DATABASE_URL || "file:control.db";
  return client(url, process.env.CONTROL_AUTH_TOKEN || undefined);
}

// Open (or reuse) a specific tenant's database, resolved from the control-plane.
export async function getTenantDb(tenantId: string): Promise<Client> {
  const rs = await getControlDb().execute({
    sql: "SELECT db_url, db_auth_token FROM tenants WHERE id = ?",
    args: [tenantId],
  });
  const row = rs.rows[0];
  if (!row) throw new Error(`unknown tenant: ${tenantId}`);
  return client(String(row.db_url), row.db_auth_token ? String(row.db_auth_token) : undefined);
}

// The active tenant client for the current async context. Tests and scripts set
// it explicitly via runWithDb; requests resolve it from the session cookie.
const dbStore = new AsyncLocalStorage<Client>();
export function runWithDb<T>(c: Client, fn: () => T): T {
  return dbStore.run(c, fn);
}

// Request-only: read the tenant id from the signed-in session cookie. Returns
// null outside a request context (e.g. a script), where cookies() throws.
async function tenantIdFromSession(): Promise<string | null> {
  try {
    const token = cookies().get("sess")?.value;
    if (!token) return null;
    const s = await verifySession(token);
    return s?.tenantId ?? null;
  } catch {
    return null;
  }
}

// Resolve the client every query runs against:
//   1. an explicit runWithDb() scope (tests, scripts, provisioning),
//   2. else the signed-in session's tenant (the real request path),
//   3. else the env-default single DB (legacy scripts/seeds/tests, dev bootstrap).
export async function getActiveDb(): Promise<Client> {
  const scoped = dbStore.getStore();
  if (scoped) return scoped;
  const tid = await tenantIdFromSession();
  if (tid) return getTenantDb(tid);
  return getDb();
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await (await getActiveDb()).execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  return (await getActiveDb()).execute({ sql, args });
}
