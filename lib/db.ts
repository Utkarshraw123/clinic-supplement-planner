import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";

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

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await getDb().execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  return getDb().execute({ sql, args });
}
