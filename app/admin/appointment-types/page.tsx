import { requireAdmin } from "@/lib/auth/current-user";
import { listAppointmentTypes } from "@/lib/appointments";
import PageHeader from "@/components/PageHeader";
import { addAppointmentTypeAction, archiveAppointmentTypeAction } from "./actions";

export default async function AppointmentTypesPage() {
  await requireAdmin();
  const types = await listAppointmentTypes();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader eyebrow="Practice settings" title="Appointment types" subtitle="The kinds of appointment your clinic offers — name, length and (optionally) price." />
      <div className="card">
        <form action={addAppointmentTypeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="name" placeholder="e.g. Initial consultation" required style={{ minWidth: 200 }} />
          <input name="durationMinutes" type="number" min={5} step={5} placeholder="Minutes" required style={{ width: 120 }} />
          <input name="price" placeholder="Price (optional)" style={{ width: 140 }} />
          <button type="submit" className="btn--primary">Add</button>
        </form>
      </div>
      <div className="card">
        {types.length === 0 ? (
          <p className="muted">No appointment types yet. Add the ones you offer.</p>
        ) : types.map((t) => (
          <div key={t.id} className="list-row" style={{ gap: 8, justifyContent: "space-between" }}>
            <span>{t.name} · {t.duration_minutes} min{t.price ? ` · ${t.price}` : ""}</span>
            <form action={archiveAppointmentTypeAction}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn--sm">Archive</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
