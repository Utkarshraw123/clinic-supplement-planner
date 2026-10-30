import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type AppointmentType = { id: number; name: string; duration_minutes: number; price: string | null; status: string };

export async function createAppointmentType(input: { name: string; durationMinutes: number; price?: string }): Promise<number> {
  const price = (input.price ?? "").trim() || null;
  const rs = await execute(
    "INSERT INTO appointment_types (name, duration_minutes, price) VALUES (?, ?, ?)",
    [input.name.trim(), input.durationMinutes, price]
  );
  return Number(rs.lastInsertRowid);
}

export async function listAppointmentTypes(includeArchived = false): Promise<AppointmentType[]> {
  const sql = includeArchived
    ? "SELECT id, name, duration_minutes, price, status FROM appointment_types ORDER BY status, name"
    : "SELECT id, name, duration_minutes, price, status FROM appointment_types WHERE status = 'active' ORDER BY name";
  return query<AppointmentType>(sql);
}

export async function getAppointmentType(id: number): Promise<AppointmentType | null> {
  const rows = await query<AppointmentType>("SELECT id, name, duration_minutes, price, status FROM appointment_types WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function archiveAppointmentType(id: number): Promise<void> {
  await execute("UPDATE appointment_types SET status = 'archived' WHERE id = ?", [id]);
}

export type AppointmentRow = {
  id: number; patient_id: number | null; practitioner_id: number | null; appointment_type_id: number | null;
  starts_at: string; ends_at: string; status: string; notes: string | null;
  type_name?: string | null; patient_name?: string | null;
};

export async function createAppointment(input: { patientId: number; appointmentTypeId: number; startsAt: string; practitionerId?: number; notes?: string; createdBy?: number }): Promise<number> {
  const type = await getAppointmentType(input.appointmentTypeId);
  if (!type) throw new Error("unknown appointment type");
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + type.duration_minutes * 60 * 1000);
  const rs = await execute(
    `INSERT INTO appointments (patient_id, practitioner_id, appointment_type_id, starts_at, ends_at, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.patientId, input.practitionerId ?? null, input.appointmentTypeId, start.toISOString(), end.toISOString(), (input.notes ?? "").trim() || null, input.createdBy ?? null]
  );
  const id = Number(rs.lastInsertRowid);
  await recordAudit({ actorId: input.createdBy, action: "appointment_booked", entity: "patient", entityId: input.patientId, detail: `appointment ${id} @ ${start.toISOString()}` });
  return id;
}

export async function getAppointment(id: number): Promise<AppointmentRow | null> {
  const rows = await query<AppointmentRow>("SELECT * FROM appointments WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listUpcomingAppointments(limit = 50): Promise<AppointmentRow[]> {
  return query<AppointmentRow>(
    `SELECT a.*, t.name AS type_name, p.name AS patient_name
       FROM appointments a
       LEFT JOIN appointment_types t ON t.id = a.appointment_type_id
       LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.status = 'booked' AND a.starts_at >= ?
      ORDER BY a.starts_at ASC LIMIT ?`,
    [new Date().toISOString(), limit]
  );
}

export async function listAppointmentsForPatient(patientId: number): Promise<AppointmentRow[]> {
  return query<AppointmentRow>(
    `SELECT a.*, t.name AS type_name
       FROM appointments a LEFT JOIN appointment_types t ON t.id = a.appointment_type_id
      WHERE a.patient_id = ? ORDER BY a.starts_at DESC`,
    [patientId]
  );
}

export async function setAppointmentStatus(id: number, status: "booked"|"completed"|"cancelled", actorId?: number): Promise<void> {
  const appt = await getAppointment(id);
  await execute("UPDATE appointments SET status = ? WHERE id = ?", [status, id]);
  if (appt?.patient_id) await recordAudit({ actorId, action: `appointment_${status}`, entity: "patient", entityId: appt.patient_id, detail: `appointment ${id}` });
}
