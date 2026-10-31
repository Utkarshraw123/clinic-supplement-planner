import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createAppointmentType, createAppointment } from "@/lib/appointments";
import { sendDueRemindersForActiveTenant } from "@/lib/reminders";

describe("reminder runner (active tenant)", () => {
  beforeAll(async () => { await runMigrations(); });

  it("sends due reminders once (mock) and is idempotent; skips no-email", async () => {
    const withEmail = await createPatient({ name: "Has Email", dob: "1990-01-01", email: "rem@x.test" });
    const noEmail = await createPatient({ name: "No Email", dob: "1990-01-01" });
    const typeId = await createAppointmentType({ name: "60m", durationMinutes: 60 });
    const soon = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await createAppointment({ patientId: withEmail, appointmentTypeId: typeId, startsAt: soon() });
    await createAppointment({ patientId: noEmail, appointmentTypeId: typeId, startsAt: soon() });

    const r1 = await sendDueRemindersForActiveTenant(24);
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    expect(r1.mocked).toBe(true); // no RESEND_API_KEY in tests
    const r2 = await sendDueRemindersForActiveTenant(24);
    expect(r2.sent).toBe(0);
  });
});
