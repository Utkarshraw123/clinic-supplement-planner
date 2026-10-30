import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb, getTenantDb, runWithDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { runMigrations } from "@/scripts/migrate";
import { addAvailabilityWindow, getOpenSlots } from "@/lib/availability";
import { createAppointmentType, listAppointmentsForPatient } from "@/lib/appointments";
import { findPatientByEmail } from "@/lib/patients";
import { bookPublicSlot } from "@/app/book/[tenant]/actions";

async function resetControl() {
  const db = getControlDb();
  for (const t of ["subscriptions", "memberships", "users", "tenants", "provisioning_jobs"]) await db.execute(`DROP TABLE IF EXISTS ${t}`);
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
}

beforeEach(async () => {
  rmSync(join(process.cwd(), "test-book.db"), { force: true });
  await resetControl();
  await upsertTenant({ id: "book-clinic", name: "Book Clinic", dbUrl: "file:test-book.db" });
});

describe("public booking", () => {
  it("creates a patient by email and books an open slot inside the tenant", async () => {
    const client = await getTenantDb("book-clinic");
    const { typeId, slot } = await runWithDb(client, async () => {
      await runMigrations();
      const typeId = await createAppointmentType({ name: "Consult", durationMinutes: 60 });
      const date = new Date(Date.now() + 7 * 86400000);
      const ds = date.toISOString().slice(0, 10);
      await addAvailabilityWindow({ weekday: date.getDay(), startTime: "09:00", endTime: "12:00" });
      const slots = await getOpenSlots(ds, 60);
      return { typeId, slot: slots[0] };
    });
    expect(slot).toBeTruthy();

    const res = await bookPublicSlot("book-clinic", { name: "Walk In", email: "walkin@x.test", appointmentTypeId: typeId, slotIso: slot });
    expect(res.ok).toBe(true);

    await runWithDb(client, async () => {
      const p = await findPatientByEmail("walkin@x.test");
      expect(p?.name).toBe("Walk In");
      expect((await listAppointmentsForPatient(p!.id)).length).toBe(1);
    });

    // Booking the same slot again is rejected (double-booking guard).
    const res2 = await bookPublicSlot("book-clinic", { name: "Walk In", email: "walkin@x.test", appointmentTypeId: typeId, slotIso: slot });
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe("slot_taken");
  });
});
