import { getControlDb, getTenantDb, runWithDb } from "@/lib/db";
import { upsertTenant, createControlUser, addMembership, findControlUserByEmail } from "@/lib/control-users";
import { runMigrations } from "@/scripts/migrate";
import { seedStarterData } from "@/scripts/seed-starter";
import { createUser, findUserByEmail } from "@/lib/users";
import { createTursoDatabase } from "@/lib/tenancy/turso";

async function setJob(tenantId: string, state: string, error?: string) {
  await getControlDb().execute({
    sql: `INSERT INTO provisioning_jobs (tenant_id, state, error, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    args: [tenantId, state, error ?? null],
  });
}

// Provision a brand-new clinic: create its database, run the schema, seed generic
// starter data, and create the owner in both the tenant DB (clinical record) and
// the control-plane (login), linked via membership. Tracked as a job so a partial
// failure is visible and retryable. `deps.createDb` is injectable for tests.
export async function provisionTenant(
  input: { tenantId: string; clinicName: string; ownerEmail: string; ownerName: string; ownerPassword: string },
  deps: { createDb?: typeof createTursoDatabase } = {}
): Promise<{ tenantId: string; tenantUserId: number }> {
  const createDb = deps.createDb ?? createTursoDatabase;
  try {
    await setJob(input.tenantId, "pending");
    const { url, authToken } = await createDb(input.tenantId);
    await upsertTenant({ id: input.tenantId, name: input.clinicName, dbUrl: url, dbAuthToken: authToken || undefined });
    await setJob(input.tenantId, "db_created");

    const tenantClient = await getTenantDb(input.tenantId);
    const tenantUserId = await runWithDb(tenantClient, async () => {
      await runMigrations();
      await setJob(input.tenantId, "schema_done");
      await seedStarterData();
      await setJob(input.tenantId, "seeded");
      const existing = await findUserByEmail(input.ownerEmail);
      if (existing) return existing.id;
      return createUser({ email: input.ownerEmail, password: input.ownerPassword, role: "admin", name: input.ownerName });
    });

    const control = await findControlUserByEmail(input.ownerEmail);
    const uid = control ? control.id : await createControlUser({ email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName });
    await addMembership({ userId: uid, tenantId: input.tenantId, role: "owner", tenantUserId });

    await setJob(input.tenantId, "done");
    return { tenantId: input.tenantId, tenantUserId };
  } catch (e) {
    await setJob(input.tenantId, "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}
