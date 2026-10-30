import { runControlMigrations } from "./migrate-control";
import { upsertTenant, createControlUser, addMembership, findControlUserByEmail } from "../lib/control-users";
import { getTenantDb, runWithDb } from "../lib/db";
import { runMigrations } from "./migrate";
import { findUserByEmail, createUser } from "../lib/users";

// Set up the control-plane for local dev and adopt the existing local.db as the
// first tenant, with a control-plane owner you can log in as, linked to the
// tenant-local user record the clinical tables reference. Idempotent.
const EMAIL = process.env.DEV_OWNER_EMAIL || "lorna@clinic.test";
const PASSWORD = process.env.DEV_OWNER_PASSWORD || "lorna123";
const NAME = process.env.DEV_OWNER_NAME || "Lorna Driver-Davies";
const TENANT_ID = process.env.DEV_TENANT_ID || "lorna-dev";
const TENANT_DB = process.env.DEV_TENANT_DB_URL || "file:local.db";

async function main() {
  await runControlMigrations();
  await upsertTenant({ id: TENANT_ID, name: "Lorna Clinic (dev)", dbUrl: TENANT_DB });

  // Resolve (or create) the tenant-local user record the clinical tables reference.
  const tenantClient = await getTenantDb(TENANT_ID);
  const tenantUserId = await runWithDb(tenantClient, async () => {
    await runMigrations();
    const existing = await findUserByEmail(EMAIL);
    if (existing) return existing.id;
    return createUser({ email: EMAIL, password: PASSWORD, role: "admin", name: NAME });
  });

  const control = await findControlUserByEmail(EMAIL);
  const uid = control ? control.id : await createControlUser({ email: EMAIL, password: PASSWORD, name: NAME });
  await addMembership({ userId: uid, tenantId: TENANT_ID, role: "owner", tenantUserId });
  console.log(`control ready: tenant=${TENANT_ID} db=${TENANT_DB} login=${EMAIL} tenantUserId=${tenantUserId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
