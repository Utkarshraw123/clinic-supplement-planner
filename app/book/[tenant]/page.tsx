import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { listAppointmentTypes, getAppointmentType } from "@/lib/appointments";
import { getOpenSlots } from "@/lib/availability";
import { bookPublicAction } from "./actions";

export default async function PublicBookingPage({ params, searchParams }: { params: { tenant: string }; searchParams: { type?: string; date?: string; booked?: string; error?: string } }) {
  const tenant = params.tenant;
  let client;
  try { client = await getTenantDb(tenant); } catch { return <main style={{ maxWidth: 560, margin: "64px auto", padding: 24 }}><h1>Clinic not found</h1></main>; }

  const data = await runWithDb(client, async () => {
    const settings = await getClinicSettings();
    const types = await listAppointmentTypes();
    const typeId = searchParams.type ? Number(searchParams.type) : (types[0]?.id ?? 0);
    const date = searchParams.date ?? new Date().toISOString().slice(0, 10);
    const type = typeId ? await getAppointmentType(typeId) : null;
    const slots = type ? await getOpenSlots(date, type.duration_minutes) : [];
    return { clinicName: settings.clinic_name || "Our clinic", types, typeId, date, slots };
  });

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <main style={{ maxWidth: 620, margin: "48px auto", padding: 24 }}>
      <h1 style={{ fontSize: 26 }}>Book with {data.clinicName}</h1>
      {searchParams.booked ? <p style={{ color: "#1a7f37", fontWeight: 600 }}>Thanks — your appointment is booked. We’ll be in touch.</p> : null}
      {searchParams.error ? <p style={{ color: "#b00" }}>Sorry, that didn’t work ({searchParams.error}). Please pick another slot.</p> : null}

      {data.types.length === 0 ? (
        <p>Online booking isn’t set up yet. Please contact the clinic directly.</p>
      ) : (
        <>
          <form method="get" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", margin: "16px 0" }}>
            <label>Appointment<br /><select name="type" defaultValue={String(data.typeId)}>{data.types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes}m)</option>)}</select></label>
            <label>Date<br /><input name="date" type="date" defaultValue={data.date} /></label>
            <button type="submit">Show times</button>
          </form>

          {data.slots.length === 0 ? (
            <p style={{ color: "#666" }}>No open times that day. Try another date.</p>
          ) : (
            <div>
              <p>Available times on {data.date}:</p>
              <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
                {data.slots.map((s) => (
                  <details key={s}>
                    <summary style={{ cursor: "pointer", padding: "6px 0" }}>{fmtTime(s)}</summary>
                    <form action={bookPublicAction.bind(null, tenant)} style={{ display: "grid", gap: 8, padding: "8px 0" }}>
                      <input type="hidden" name="appointmentTypeId" value={data.typeId} />
                      <input type="hidden" name="slot" value={s} />
                      <input name="name" placeholder="Your name" required />
                      <input name="email" type="email" placeholder="Your email" required />
                      <button type="submit">Book {fmtTime(s)}</button>
                    </form>
                  </details>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
