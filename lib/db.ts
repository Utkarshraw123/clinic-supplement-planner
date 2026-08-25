import { createClient, type Client, type InArgs, type ResultSet } from "@libsql/client";

let _db: Client | null = null;

export function getDb(): Client {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL || "file:local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  _db = createClient({ url, authToken });
  return _db;
}

export async function query<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const rs = await getDb().execute({ sql, args });
  return rs.rows as unknown as T[];
}

export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  return getDb().execute({ sql, args });
}
