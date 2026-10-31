import { getControlDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export type MembershipRole = "owner" | "admin" | "practitioner";

export async function upsertTenant(input: {
  id: string;
  name: string;
  dbUrl: string;
  dbAuthToken?: string;
}): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO tenants (id, name, db_url, db_auth_token) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, db_url=excluded.db_url, db_auth_token=excluded.db_auth_token`,
    args: [input.id, input.name, input.dbUrl, input.dbAuthToken ?? null],
  });
}

export async function createControlUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<number> {
  const hash = await hashPassword(input.password);
  const rs = await getControlDb().execute({
    sql: "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
    args: [input.email.toLowerCase().trim(), hash, input.name.trim()],
  });
  return Number(rs.lastInsertRowid);
}

export async function findControlUserByEmail(email: string) {
  const rs = await getControlDb().execute({
    sql: "SELECT id, email, password_hash, name FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    email: String(r.email),
    password_hash: String(r.password_hash),
    name: String(r.name),
  };
}

export async function addMembership(input: {
  userId: number;
  tenantId: string;
  role: MembershipRole;
  tenantUserId: number;
}): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO memberships (user_id, tenant_id, role, tenant_user_id) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, tenant_id) DO UPDATE SET role=excluded.role, tenant_user_id=excluded.tenant_user_id`,
    args: [input.userId, input.tenantId, input.role, input.tenantUserId],
  });
}

export async function listTenants(): Promise<{ id: string; db_url: string; db_auth_token: string | null }[]> {
  const rs = await getControlDb().execute("SELECT id, db_url, db_auth_token FROM tenants ORDER BY id");
  return rs.rows.map((r) => ({
    id: String(r.id),
    db_url: String(r.db_url),
    db_auth_token: r.db_auth_token ? String(r.db_auth_token) : null,
  }));
}

export async function findPrimaryMembership(userId: number) {
  const rs = await getControlDb().execute({
    sql: "SELECT tenant_id, role, tenant_user_id FROM memberships WHERE user_id = ? ORDER BY created_at, tenant_id LIMIT 1",
    args: [userId],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return { tenant_id: String(r.tenant_id), role: r.role as MembershipRole, tenant_user_id: Number(r.tenant_user_id) };
}
