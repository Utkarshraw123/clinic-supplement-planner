import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { createAppointmentType, createAppointment, getAppointment, listUpcomingAppointments, listAppointmentsForPatient, setAppointmentStatus } from "@/lib/appointments";
import { listAuditForEntity } from "@/lib/audit";

describe("appointments", () => {
  beforeAll(async () => { await runMigrations(); });

  it("books (computing end from duration), lists, changes status, audits; erasure removes", async () => {
    const pid = await createPatient({ name: "Appt P", dob: "1990-01-01" });
    const typeId = await createAppointmentType({ name: "60m", durationMinutes: 60 });
    const future = new Date(Date.now() + 86400000).toISOString();

    const aid = await createAppointment({ patientId: pid, appointmentTypeId: typeId, startsAt: future, practitionerId: 1, createdBy: 1 });
    const a = await getAppointment(aid);
    expect(a?.status).toBe("booked");
    expect(new Date(a!.ends_at).getTime() - new Date(a!.starts_at).getTime()).toBe(60 * 60 * 1000);

    expect((await listUpcomingAppointments()).some((x) => x.id === aid)).toBe(true);
    expect((await listAppointmentsForPatient(pid)).some((x) => x.id === aid)).toBe(true);

    await setAppointmentStatus(aid, "cancelled", 1);
    expect((await getAppointment(aid))?.status).toBe("cancelled");
    expect((await listUpcomingAppointments()).some((x) => x.id === aid)).toBe(false);

    const audit = await listAuditForEntity("patient", pid);
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(["appointment_booked", "appointment_cancelled"]));

    await deletePatient(pid, 1);
    expect(await listAppointmentsForPatient(pid)).toHaveLength(0);
  });
});
