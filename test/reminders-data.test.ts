import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createAppointmentType, createAppointment, listDueReminders, markReminderSent } from "@/lib/appointments";

describe("reminder data", () => {
  beforeAll(async () => { await runMigrations(); });

  it("lists appointments due within the window (unsent) and marks them sent", async () => {
    const pid = await createPatient({ name: "Due P", dob: "1990-01-01", email: "due@x.test" });
    const typeId = await createAppointmentType({ name: "60m", durationMinutes: 60 });
    const soon = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();      // +3h
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();    // +48h (outside 24h)
    const aSoon = await createAppointment({ patientId: pid, appointmentTypeId: typeId, startsAt: soon });
    await createAppointment({ patientId: pid, appointmentTypeId: typeId, startsAt: later });

    const due = await listDueReminders(24);
    const ids = due.map((d) => d.id);
    expect(ids).toContain(aSoon);
    expect(due.find((d) => d.id === aSoon)?.patient_email).toBe("due@x.test");
    expect(due.every((d) => new Date(d.starts_at).getTime() <= Date.now() + 24 * 3600 * 1000)).toBe(true);

    await markReminderSent(aSoon);
    expect((await listDueReminders(24)).some((d) => d.id === aSoon)).toBe(false);
  });
});
