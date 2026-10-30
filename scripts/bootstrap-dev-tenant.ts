import { runControlMigrations } from "./migrate-control";
import {
  upsertTenant,
  createControlUser,
  addMembership,
  findControlUserByEmail,
} from "../lib/control-users";

// Set up the control-plane for local dev and adopt the existing local.db as the
// first tenant, with a control-plane owner you can log in as. Idempotent.
const EMAIL = process.env.DEV_OWNER_EMAIL || "lorna@clinic.test";
const PASSWORD = process.env.DEV_OWNER_PASSWORD || "lorna123";
const NAME = process.env.DEV_OWNER_NAME || "Lorna Driver-Davies";
const TENANT_ID = process.env.DEV_TENANT_ID || "lorna-dev";
const TENANT_DB = process.env.DEV_TENANT_DB_URL || "file:local.db";

async function main() {
  await runControlMigrations();
  await upsertTenant({ id: TENANT_ID, name: "Lorna Clinic (dev)", dbUrl: TENANT_DB });
  const existing = await findControlUserByEmail(EMAIL);
  const uid = existing ? existing.id : await createControlUser({ email: EMAIL, password: PASSWORD, name: NAME });
  await addMembership({ userId: uid, tenantId: TENANT_ID, role: "owner" });
  console.log(`control ready: tenant=${TENANT_ID} db=${TENANT_DB} login=${EMAIL}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
