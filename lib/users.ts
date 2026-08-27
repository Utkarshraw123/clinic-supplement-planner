import { query, execute } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

export type UserRow = { id: number; email: string; password_hash: string; role: "admin"|"team"; name: string };

export async function createUser(input: { email: string; password: string; role: "admin"|"team"; name: string }): Promise<number> {
  const hash = await hashPassword(input.password);
  const rs = await execute(
    "INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)",
    [input.email.toLowerCase().trim(), hash, input.role, input.name.trim()]
  );
  return Number(rs.lastInsertRowid);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  return rows[0] ?? null;
}

export async function listUsers(): Promise<Omit<UserRow, "password_hash">[]> {
  return query("SELECT id, email, role, name FROM users ORDER BY name");
}

export async function getUserById(id: number): Promise<UserRow | null> {
  const rows = await query<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function updateUserPassword(id: number, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
}

export async function deleteUser(id: number): Promise<void> {
  await execute("DELETE FROM users WHERE id = ?", [id]);
}
