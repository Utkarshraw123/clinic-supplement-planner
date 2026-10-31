import { requireUser } from "@/lib/auth/current-user";
import { listUpcomingAppointments, listAppointmentTypes } from "@/lib/appointments";
import { listPatients } from "@/lib/patients";
import PageHeader from "@/components/PageHeader";
import { bookAppointmentAction, setStatusAction } from "./actions";

export default async function AppointmentsPage() {
  await requireUser();
  const [upcoming, types, patients] = await Promise.all([listUpcomingAppointments(), listAppointmentTypes(), listPatients()]);
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader eyebrow="Scheduling" title="Appointments" subtitle="Book and manage upcoming appointments." />
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Book an appointment</h2>
        {types.length === 0 || patients.length === 0 ? (
          <p className="muted">{types.length === 0 ? "Add an appointment type first (Practice settings → Appointment types)." : "Add a patient first."}</p>
        ) : (
          <form action={bookAppointmentAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label className="stack" style={{ gap: 4 }}><span className="muted-xs">Patient</span>
              <select name="patientId" required>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="stack" style={{ gap: 4 }}><span className="muted-xs">Type</span>
              <select name="appointmentTypeId" required>{types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes}m)</option>)}</select>
            </label>
            <label className="stack" style={{ gap: 4 }}><span className="muted-xs">Date</span><input name="date" type="date" required /></label>
            <label className="stack" style={{ gap: 4 }}><span className="muted-xs">Time</span><input name="time" type="time" required /></label>
            <button type="submit" className="btn--primary">Book</button>
          </form>
        )}
      </div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Upcoming</h2>
        {upcoming.length === 0 ? <p className="muted">No upcoming appointments.</p> : upcoming.map((a) => (
          <div key={a.id} className="list-row" style={{ gap: 8, justifyContent: "space-between" }}>
            <span>{fmt(a.starts_at)} · {a.patient_name ?? "—"} · {a.type_name ?? "—"}</span>
            <span className="row" style={{ gap: 6 }}>
              <form action={setStatusAction.bind(null, a.id, "completed", "/appointments")}><button className="btn--sm">Complete</button></form>
              <form action={setStatusAction.bind(null, a.id, "cancelled", "/appointments")}><button className="btn--sm">Cancel</button></form>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
