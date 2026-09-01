/**
 * Demo login: make the clinic's admin reachable with the memorable credential
 *   username: lorna123   password: lorna123
 *
 * Idempotent. If a `lorna123` user already exists it just (re)sets the password;
 * otherwise it renames the primary admin's login to `lorna123`; failing that it
 * creates a fresh admin. Run on local + prod:
 *   npx tsx scripts/seed-demo-login.ts
 *
 * NOTE: this is a weak demo password by design. Change it (or the whole account)
 * from /account before the tool holds real patient data.
 */
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";
import { findUserByEmail, getUserById, updateUser, updateUserPassword, createUser } from "@/lib/users";

const LOGIN = "lorna123";
const PASSWORD = "lorna123";

async function main() {
  await runMigrations();

  const existing = await findUserByEmail(LOGIN);
  if (existing) {
    await updateUser(existing.id, { name: existing.name, email: LOGIN, role: "admin" });
    await updateUserPassword(existing.id, PASSWORD);
    console.log(`Demo login ready: ${LOGIN} / ${PASSWORD} (updated existing user id ${existing.id}).`);
    return;
  }

  const admin = (await query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"))[0];
  if (admin) {
    const u = (await getUserById(admin.id))!;
    await updateUser(admin.id, { name: u.name || "Lorna Driver-Davies", email: LOGIN, role: "admin" });
    await updateUserPassword(admin.id, PASSWORD);
    console.log(`Demo login ready: ${LOGIN} / ${PASSWORD} (renamed admin id ${admin.id}, was ${u.email}).`);
    return;
  }

  const id = await createUser({ email: LOGIN, password: PASSWORD, role: "admin", name: "Lorna Driver-Davies" });
  console.log(`Demo login ready: ${LOGIN} / ${PASSWORD} (created new admin id ${id}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
