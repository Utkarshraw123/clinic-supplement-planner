import { requireAdmin } from "@/lib/auth/current-user";
import { listAvailability, WEEKDAYS } from "@/lib/availability";
import PageHeader from "@/components/PageHeader";
import { addAvailabilityAction, removeAvailabilityAction } from "./actions";

export default async function AvailabilityPage() {
  await requireAdmin();
  const windows = await listAvailability();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader eyebrow="Practice settings" title="Availability" subtitle="The weekly hours clients can book into on your public booking page." />
      <div className="card">
        <form action={addAvailabilityAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="stack" style={{ gap: 4 }}><span className="muted-xs">Day</span>
            <select name="weekday" required>{WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          </label>
          <label className="stack" style={{ gap: 4 }}><span className="muted-xs">From</span><input name="startTime" type="time" required /></label>
          <label className="stack" style={{ gap: 4 }}><span className="muted-xs">To</span><input name="endTime" type="time" required /></label>
          <button type="submit" className="btn--primary">Add</button>
        </form>
      </div>
      <div className="card">
        {windows.length === 0 ? <p className="muted">No availability yet. Add your weekly hours.</p> : windows.map((w) => (
          <div key={w.id} className="list-row" style={{ gap: 8, justifyContent: "space-between" }}>
            <span>{WEEKDAYS[w.weekday]} · {w.start_time}–{w.end_time}</span>
            <form action={removeAvailabilityAction}><input type="hidden" name="id" value={w.id} /><button className="btn--sm">Remove</button></form>
          </div>
        ))}
      </div>
    </div>
  );
}
