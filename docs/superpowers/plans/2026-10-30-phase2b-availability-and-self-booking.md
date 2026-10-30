# Phase 2b — Availability + Public Self-Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Weekly clinic availability, a pure slot-computation function (open slots = availability minus booked), and a public per-clinic booking page where a client picks a type + date + open slot and books (reusing or creating a patient by email).

**Architecture:** An `availability` table (weekly windows). `lib/availability.ts` provides window CRUD, a **pure** `computeSlots()` (no I/O), and `getOpenSlots()` (reads availability + booked appointments, calls `computeSlots`). An admin availability page. A **public**, tenant-from-URL page `/book/[tenant]` that resolves the tenant from the slug and runs all DB work inside `runWithDb(getTenantDb(slug))` (there is no session on a public page). `findPatientByEmail` reuses an existing client. Middleware makes `/book` public.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `vitest`.

## Global Constraints

- New table in `lib/schema.sql`. No `;` inside SQL comments.
- The public booking page has **no session** → it must wrap every DB call in `runWithDb(await getTenantDb(slug))`. Never rely on session-based tenant resolution there.
- `computeSlots` is pure (no I/O, deterministic given inputs) and fully unit-tested.
- Re-check slot availability at booking time (best-effort double-booking guard).
- Booking a public appointment is audited (`lib/audit`, entity `patient`, PII-free detail).
- Keep `npm test` green (currently 190).

---

### Task 1: Availability model + admin UI

**Files:**
- Modify: `lib/schema.sql` (add `availability`)
- Create: `lib/availability.ts` (windows portion)
- Create: `app/admin/availability/page.tsx`, `app/admin/availability/actions.ts`
- Modify: `components/AppShell.tsx` (admin nav link)
- Test: `test/availability.test.ts`

**Interfaces:**
- Produces:
  - `type AvailabilityWindow = { id: number; weekday: number; start_time: string; end_time: string }`.
  - `addAvailabilityWindow(input: { weekday: number; startTime: string; endTime: string }): Promise<number>`.
  - `listAvailability(): Promise<AvailabilityWindow[]>` — ordered by weekday, start_time.
  - `removeAvailabilityWindow(id: number): Promise<void>`.
  - `WEEKDAYS: string[]` = `["Sunday","Monday",...]`.

- [ ] **Step 1: Write the failing test**

```ts
// test/availability.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addAvailabilityWindow, listAvailability, removeAvailabilityWindow } from "@/lib/availability";

describe("availability windows", () => {
  beforeAll(async () => { await runMigrations(); });

  it("adds, lists (ordered) and removes windows", async () => {
    const a = await addAvailabilityWindow({ weekday: 1, startTime: "09:00", endTime: "12:00" });
    await addAvailabilityWindow({ weekday: 1, startTime: "13:00", endTime: "17:00" });
    const list = (await listAvailability()).filter((w) => w.weekday === 1);
    expect(list.map((w) => w.start_time)).toEqual(["09:00", "13:00"]);
    await removeAvailabilityWindow(a);
    expect((await listAvailability()).some((w) => w.id === a)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/availability.test.ts`
Expected: FAIL — `@/lib/availability` not found.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql` (after `appointments`):

```sql
-- Weekly clinic availability windows (clinic-wide). weekday 0=Sunday..6=Saturday.
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
```

- [ ] **Step 4: Create `lib/availability.ts` (windows portion)**

```ts
import { query, execute } from "@/lib/db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityWindow = { id: number; weekday: number; start_time: string; end_time: string };

export async function addAvailabilityWindow(input: { weekday: number; startTime: string; endTime: string }): Promise<number> {
  const rs = await execute(
    "INSERT INTO availability (weekday, start_time, end_time) VALUES (?, ?, ?)",
    [input.weekday, input.startTime, input.endTime]
  );
  return Number(rs.lastInsertRowid);
}

export async function listAvailability(): Promise<AvailabilityWindow[]> {
  return query<AvailabilityWindow>("SELECT id, weekday, start_time, end_time FROM availability ORDER BY weekday, start_time");
}

export async function removeAvailabilityWindow(id: number): Promise<void> {
  await execute("DELETE FROM availability WHERE id = ?", [id]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/availability.test.ts`
Expected: PASS.

- [ ] **Step 6: Admin UI (actions + page)**

```ts
// app/admin/availability/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { addAvailabilityWindow, removeAvailabilityWindow } from "@/lib/availability";

export async function addAvailabilityAction(formData: FormData) {
  await requireAdmin();
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!Number.isInteger(weekday) || !startTime || !endTime || startTime >= endTime) return;
  await addAvailabilityWindow({ weekday, startTime, endTime });
  revalidatePath("/admin/availability");
}

export async function removeAvailabilityAction(formData: FormData) {
  await requireAdmin();
  await removeAvailabilityWindow(Number(formData.get("id")));
  revalidatePath("/admin/availability");
}
```

```tsx
// app/admin/availability/page.tsx
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
```

- [ ] **Step 7: Admin nav link + typecheck + commit**

In `components/AppShell.tsx`, after the "Appointment types" admin line add:
```ts
      { href: "/admin/availability", label: "Availability", icon: "calendar" },
```
Then:
```bash
npx tsc --noEmit
git add lib/schema.sql lib/availability.ts "app/admin/availability/page.tsx" "app/admin/availability/actions.ts" components/AppShell.tsx test/availability.test.ts
git commit -m "feat: weekly availability windows (model + admin UI)"
```

---

### Task 2: Slot computation (pure) + getOpenSlots

**Files:**
- Modify: `lib/availability.ts` (add `computeSlots` + `getOpenSlots`)
- Test: `test/slots.test.ts`

**Interfaces:**
- Produces:
  - `computeSlots(input: { date: string; durationMinutes: number; windows: { start_time: string; end_time: string }[]; booked: { start: string; end: string }[]; stepMinutes?: number; now?: Date }): string[]` — ISO start times; pure. A slot is included when `[start, start+duration]` fits inside a window, overlaps no booked interval, and starts strictly after `now`.
  - `getOpenSlots(date: string, durationMinutes: number): Promise<string[]>` — reads availability for that weekday + booked appointments on that date, calls `computeSlots`.
- Consumes: `listAvailability`, `query` (appointments), `getAppointmentType` is NOT needed (duration passed in).

- [ ] **Step 1: Write the failing test**

```ts
// test/slots.test.ts
import { describe, it, expect } from "vitest";
import { computeSlots } from "@/lib/availability";

const past = new Date("2000-01-01T00:00:00");

describe("computeSlots (pure)", () => {
  it("tiles a window into duration-sized slots", () => {
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked: [], now: past });
    // 09, 10, 11 starts (11->12 fits; 12 would end 13 > window)
    expect(slots.map((s) => new Date(s).getHours())).toEqual([9, 10, 11]);
  });

  it("excludes slots overlapping a booked interval", () => {
    const booked = [{ start: new Date("2030-06-03T10:00").toISOString(), end: new Date("2030-06-03T11:00").toISOString() }];
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked, now: past });
    expect(slots.map((s) => new Date(s).getHours())).toEqual([9, 11]);
  });

  it("excludes slots that start in the past", () => {
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked: [], now: new Date("2030-06-03T10:30") });
    expect(slots.map((s) => new Date(s).getHours())).toEqual([11]);
  });

  it("returns nothing when there are no windows", () => {
    expect(computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [], booked: [], now: past })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/slots.test.ts`
Expected: FAIL — `computeSlots` not exported.

- [ ] **Step 3: Add `computeSlots` + `getOpenSlots` to `lib/availability.ts`**

Add the `query` import is already present. Append:

```ts
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

export function computeSlots(input: {
  date: string; durationMinutes: number;
  windows: { start_time: string; end_time: string }[];
  booked: { start: string; end: string }[];
  stepMinutes?: number; now?: Date;
}): string[] {
  const step = (input.stepMinutes ?? input.durationMinutes) * 60 * 1000;
  const durMs = input.durationMinutes * 60 * 1000;
  const now = input.now ?? new Date();
  const booked = input.booked.map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  const out: string[] = [];
  for (const w of input.windows) {
    const windowStart = at(input.date, w.start_time).getTime();
    const windowEnd = at(input.date, w.end_time).getTime();
    for (let s = windowStart; s + durMs <= windowEnd; s += step) {
      const e = s + durMs;
      if (s <= now.getTime()) continue;
      const overlaps = booked.some((b) => s < b.e && e > b.s);
      if (!overlaps) out.push(new Date(s).toISOString());
    }
  }
  return out.sort();
}

export async function getOpenSlots(date: string, durationMinutes: number): Promise<string[]> {
  const weekday = at(date, "00:00").getDay();
  const windows = (await listAvailability()).filter((w) => w.weekday === weekday);
  const dayStart = at(date, "00:00").toISOString();
  const dayEnd = at(date, "23:59").toISOString();
  const booked = await query<{ start: string; end: string }>(
    "SELECT starts_at AS start, ends_at AS end FROM appointments WHERE status = 'booked' AND starts_at >= ? AND starts_at <= ?",
    [dayStart, dayEnd]
  );
  return computeSlots({ date, durationMinutes, windows, booked });
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

```bash
npx vitest run test/slots.test.ts
git add lib/availability.ts test/slots.test.ts
git commit -m "feat: pure slot computation + getOpenSlots (availability minus booked)"
```

---

### Task 3: Public self-booking page

**Files:**
- Create: `app/book/[tenant]/page.tsx`
- Create: `app/book/[tenant]/actions.ts`
- Modify: `lib/patients.ts` (add `findPatientByEmail`)
- Modify: `middleware.ts` (make `/book` public)
- Test: `test/public-booking.test.ts`

**Interfaces:**
- Produces: `findPatientByEmail(email: string): Promise<{ id: number; name: string } | null>` in `lib/patients.ts`.
- Produces: `bookPublicAction(tenant: string, formData: FormData)` — runs inside `runWithDb(getTenantDb(tenant))`: validate the chosen slot is still open, reuse/create the patient by email, create the appointment, redirect to a confirmation.

- [ ] **Step 1: Write the failing test (the booking orchestration under a tenant)**

```ts
// test/public-booking.test.ts
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
      // Pick a weekday ~1 week out and open that weekday 09:00-12:00.
      const date = new Date(Date.now() + 7 * 86400000);
      const ds = date.toISOString().slice(0, 10);
      await addAvailabilityWindow({ weekday: date.getDay(), startTime: "09:00", endTime: "12:00" });
      const slots = await getOpenSlots(ds, 60);
      return { typeId, slot: slots[0] };
    });
    expect(slot).toBeTruthy();

    // bookPublicSlot is the non-redirecting core the action wraps.
    await bookPublicSlot("book-clinic", { name: "Walk In", email: "walkin@x.test", appointmentTypeId: typeId, slotIso: slot });

    await runWithDb(client, async () => {
      const p = await findPatientByEmail("walkin@x.test");
      expect(p?.name).toBe("Walk In");
      expect((await listAppointmentsForPatient(p!.id)).length).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/public-booking.test.ts`
Expected: FAIL — modules/functions not found.

- [ ] **Step 3: Add `findPatientByEmail` to `lib/patients.ts`**

```ts
export async function findPatientByEmail(email: string): Promise<{ id: number; name: string } | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const rows = await query<{ id: number; name: string }>("SELECT id, name FROM patients WHERE lower(email) = ? ORDER BY id LIMIT 1", [e]);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Create `app/book/[tenant]/actions.ts`**

```ts
"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getOpenSlots } from "@/lib/availability";
import { getAppointmentType, createAppointment } from "@/lib/appointments";
import { findPatientByEmail, createPatient } from "@/lib/patients";

// Core booking logic under a given tenant (no redirect) — unit-testable.
export async function bookPublicSlot(tenant: string, input: { name: string; email: string; appointmentTypeId: number; slotIso: string }): Promise<{ ok: boolean; reason?: string }> {
  const client = await getTenantDb(tenant);
  return runWithDb(client, async () => {
    const type = await getAppointmentType(input.appointmentTypeId);
    if (!type || type.status !== "active") return { ok: false, reason: "type" };
    const date = input.slotIso.slice(0, 10);
    const open = await getOpenSlots(date, type.duration_minutes);
    if (!open.includes(input.slotIso)) return { ok: false, reason: "slot_taken" };

    const existing = await findPatientByEmail(input.email);
    const patientId = existing ? existing.id : await createPatient({ name: input.name, dob: "", email: input.email });
    await createAppointment({ patientId, appointmentTypeId: input.appointmentTypeId, startsAt: input.slotIso });
    return { ok: true };
  });
}

export async function bookPublicAction(tenant: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const appointmentTypeId = Number(formData.get("appointmentTypeId"));
  const slotIso = String(formData.get("slot") ?? "");
  if (!name || !email || !appointmentTypeId || !slotIso) redirect(`/book/${tenant}?error=missing`);
  const res = await bookPublicSlot(tenant, { name, email, appointmentTypeId, slotIso });
  redirect(res.ok ? `/book/${tenant}?booked=1` : `/book/${tenant}?error=${res.reason ?? "failed"}`);
}
```

- [ ] **Step 5: Create the public page `app/book/[tenant]/page.tsx`**

```tsx
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
            <p className="muted">No open times that day. Try another date.</p>
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
```

- [ ] **Step 6: Make `/book` public in middleware**

In `middleware.ts`, add `"/book"` to the `PUBLIC` array.

- [ ] **Step 7: Run tests, typecheck, full suite, verify in browser + commit**

```bash
npx vitest run test/public-booking.test.ts
npx tsc --noEmit
npm test
```
Smoke (after `npm run migrate:all`): as admin add availability for a weekday; then open `/book/lorna-dev` (no login needed — use a private window or just the URL), pick the type + that weekday’s date, expand a time, enter name + email, Book → confirmation shows; back in the app the appointment appears under Upcoming and a patient exists for that email.
```bash
git add "app/book/[tenant]/page.tsx" "app/book/[tenant]/actions.ts" lib/patients.ts middleware.ts test/public-booking.test.ts
git commit -m "feat: public per-clinic self-booking page (tenant-from-URL, open-slot booking)"
```

---

## Self-Review

**Spec coverage (Phase 2b):** availability model + admin UI (Task 1), pure slot computation + getOpenSlots (Task 2), public self-booking page with tenant-from-URL + reuse/create patient + double-booking re-check (Task 3). ✓

**Placeholder scan:** No TBD/TODO. Complete code for all new files; existing-file edits (nav, middleware, `lib/patients.ts`) are precise.

**Type consistency:** `AvailabilityWindow` (Task 1) feeds `computeSlots`/`getOpenSlots` (Task 2), consumed by the public page + `bookPublicSlot` (Task 3). `bookPublicSlot` reuses `getAppointmentType`/`createAppointment` (2a) and `findPatientByEmail`/`createPatient` (1a). The public page and action both resolve the tenant via `getTenantDb(tenant)` + `runWithDb` (no session), per the global constraint.

**Security/constraints honored:** public page never uses session-based tenant resolution; slot re-checked at booking; booking audited via `createAppointment` (entity patient). `/book` added to middleware PUBLIC.

**Known follow-ups:** 2c reminders (cron), 2d client portal (magic link). Per-practitioner availability (vs clinic-wide) and timezone handling are future refinements; v1 uses clinic-wide windows in server-local time.
