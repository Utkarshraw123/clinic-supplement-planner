import { runMigrations } from "./migrate";
import { createUser, findUserByEmail } from "../lib/users";

async function main() {
  await runMigrations();
  const email = process.env.SEED_ADMIN_EMAIL || "admin@clinic.test";
  const password = process.env.SEED_ADMIN_PASSWORD || "wild-admin-2026";
  if (await findUserByEmail(email)) { console.log("admin already exists"); return; }
  await createUser({ email, password, role: "admin", name: "Clinic Admin" });
  console.log(`seeded admin ${email}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
