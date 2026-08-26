/**
 * Set the admin account to Lorna's name and add two team members for UAT.
 * Idempotent. Run with:  npx tsx scripts/seed-team.ts
 */
import { runMigrations } from "@/scripts/migrate";
import { createUser, findUserByEmail } from "@/lib/users";
import { execute } from "@/lib/db";

const LORNA = "Lorna Driver-Davies";
const MEMBERS = [
  { email: "member1@clinic.test", name: "Member 1", password: "wild-team-2026" },
  { email: "member2@clinic.test", name: "Member 2", password: "wild-team-2026" },
];

async function main() {
  await runMigrations();

  // Rename the clinic admin to Lorna (keeps the existing login email).
  const res = await execute("UPDATE users SET name = ? WHERE role = 'admin'", [LORNA]);
  console.log(`admin renamed to "${LORNA}" (rows: ${res.rowsAffected})`);

  for (const m of MEMBERS) {
    if (await findUserByEmail(m.email)) { console.log(`skip ${m.email} (exists)`); continue; }
    await createUser({ email: m.email, name: m.name, role: "team", password: m.password });
    console.log(`created ${m.name} <${m.email}> (team)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
