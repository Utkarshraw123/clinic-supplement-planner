# Phase 2a — Appointments Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Appointment types and a per-tenant appointments model, with a practitioner UI to book and manage appointments manually, an appointments section on the patient page, cleaned up on erasure and included in the GDPR export.

**Architecture:** Two per-tenant tables: `appointment_types` and `appointments`. `lib/appointments.ts` provides type CRUD and appointment create/list/status (create computes `ends_at` from the type's duration). Admin UI for types; an `/appointments` page (upcoming list + book form) and a patient-page section. `deletePatient` and `exportPatientData` extend to cover appointments.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `vitest`.

## Global Constraints

- New tables in `lib/schema.sql` (CREATE TABLE IF NOT EXISTS). No `;` inside SQL comments.
- Per-tenant clinical data via tenant-aware `query`/`execute`.
- Appointment create/cancel/status changes are audited (`lib/audit`), entity `patient`, **no PII in detail**.
- `deletePatient` removes the patient's appointments (explicit delete).
- Keep `npm test` green (currently 188).

---

### Task 1: Appointment types (model + admin UI)

**Files:**
- Modify: `lib/schema.sql` (add `appointment_types`)
- Create: `lib/appointments.ts` (types portion)
- Create: `app/admin/appointment-types/page.tsx`
- Create: `app/admin/appointment-types/actions.ts`
- Modify: `components/AppShell.tsx` (admin nav link)
- Test: `test/appointment-types.test.ts`

**Interfaces:**
- Produces:
  - `type AppointmentType = { id: number; name: string; duration_minutes: number; price: string | null; status: string }`.
  - `createAppointmentType(input: { name: string; durationMinutes: number; price?: string }): Promise<number>`.
  - `listAppointmentTypes(includeArchived?: boolean): Promise<AppointmentType[]>` (active only by default).
  - `getAppointmentType(id: number): Promise<AppointmentType | null>`.
  - `archiveAppointmentType(id: number): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/appointment-types.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createAppointmentType, listAppointmentTypes, getAppointmentType, archiveAppointmentType } from "@/lib/appointments";

describe("appointment types", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists active, fetches and archives", async () => {
    const id = await createAppointmentType({ name: "Initial consult", durationMinutes: 60, price: "£90" });
    const active = await listAppointmentTypes();
    expect(active.find((t) => t.id === id)?.name).toBe("Initial consult");
    expect((await getAppointmentType(id))?.duration_minutes).toBe(60);

    await archiveAppointmentType(id);
    expect((await listAppointmentTypes()).find((t) => t.id === id)).toBeUndefined();
    expect((await listAppointmentTypes(true)).find((t) => t.id === id)?.status).toBe("archived");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/appointment-types.test.ts`
Expected: FAIL — `@/lib/appointments` not found.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql` (near the end, before any trailing content):

```sql
-- Appointment types a clinic offers (name + duration, optional price).
CREATE TABLE IF NOT EXISTS appointment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `lib/appointments.ts` (types portion)**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/appointment-types.test.ts`
Expected: PASS.

- [ ] **Step 6: Admin UI — actions + page**

```ts
// app/admin/appointment-types/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAppointmentType, archiveAppointmentType } from "@/lib/appointments";

export async function addAppointmentTypeAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes"));
  const price = String(formData.get("price") ?? "");
  if (!name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
  await createAppointmentType({ name, durationMinutes, price });
  revalidatePath("/admin/appointment-types");
}

export async function archiveAppointmentTypeAction(formData: FormData) {
  await requireAdmin();
  await archiveAppointmentType(Number(formData.get("id")));
  revalidatePath("/admin/appointment-types");
}
```

```tsx
// app/admin/appointment-types/page.tsx
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
```

- [ ] **Step 7: Add the admin nav link**

In `components/AppShell.tsx`, inside the `if (user.role === "admin")` push list, add after the "Dosing presets" line:

```ts
      { href: "/admin/appointment-types", label: "Appointment types", icon: "calendar" },
```

(If `calendar` is not a known icon, reuse an existing one such as `note`.)

- [ ] **Step 8: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/schema.sql lib/appointments.ts "app/admin/appointment-types/page.tsx" "app/admin/appointment-types/actions.ts" components/AppShell.tsx test/appointment-types.test.ts
git commit -m "feat: appointment types (model + admin UI)"
```

---

### Task 2: Appointments model + erasure + export

**Files:**
- Modify: `lib/schema.sql` (add `appointments`)
- Modify: `lib/appointments.ts` (appointments portion)
- Modify: `lib/patients.ts` (`deletePatient` removes appointments)
- Modify: `lib/gdpr-export.ts` (include appointments)
- Test: `test/appointments.test.ts`, `test/gdpr-export.test.ts`

**Interfaces:**
- Produces:
  - `type AppointmentRow = { id: number; patient_id: number | null; practitioner_id: number | null; appointment_type_id: number | null; starts_at: string; ends_at: string; status: string; notes: string | null; type_name?: string | null; patient_name?: string | null }`.
  - `createAppointment(input: { patientId: number; appointmentTypeId: number; startsAt: string; practitionerId?: number; notes?: string; createdBy?: number }): Promise<number>` — computes `ends_at` from the type's duration; audited `appointment_booked`.
  - `getAppointment(id: number): Promise<AppointmentRow | null>`.
  - `listUpcomingAppointments(limit?: number): Promise<AppointmentRow[]>` — status `booked`, `starts_at >= now`, soonest first, with `type_name` + `patient_name`.
  - `listAppointmentsForPatient(patientId: number): Promise<AppointmentRow[]>` — newest first, with `type_name`.
  - `setAppointmentStatus(id: number, status: "booked"|"completed"|"cancelled", actorId?: number): Promise<void>` — audited `appointment_<status>`.
- Consumes: `getAppointmentType` (Task 1), `query`/`execute`, `recordAudit`.

- [ ] **Step 1: Write the failing test**

```ts
// test/appointments.test.ts
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
    // end = start + 60 minutes
    expect(new Date(a!.ends_at).getTime() - new Date(a!.starts_at).getTime()).toBe(60 * 60 * 1000);

    expect((await listUpcomingAppointments()).some((x) => x.id === aid)).toBe(true);
    expect((await listAppointmentsForPatient(pid)).some((x) => x.id === aid)).toBe(true);

    await setAppointmentStatus(aid, "cancelled", 1);
    expect((await getAppointment(aid))?.status).toBe("cancelled");
    // cancelled no longer "upcoming"
    expect((await listUpcomingAppointments()).some((x) => x.id === aid)).toBe(false);

    const audit = await listAuditForEntity("patient", pid);
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(["appointment_booked", "appointment_cancelled"]));

    await deletePatient(pid, 1);
    expect(await listAppointmentsForPatient(pid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/appointments.test.ts`
Expected: FAIL — appointment functions not exported.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql`, after `appointment_types`:

```sql
-- Booked appointments.
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id INTEGER REFERENCES users(id),
  appointment_type_id INTEGER REFERENCES appointment_types(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);
```

- [ ] **Step 4: Add the appointments functions to `lib/appointments.ts`**

Append:

```ts
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
```

- [ ] **Step 5: Remove appointments on erasure**

In `lib/patients.ts`, inside `deletePatient`, add to `stmts` before the `patient_intake` delete:

```ts
  stmts.push({ sql: `DELETE FROM appointments WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 6: Include appointments in the GDPR export**

In `lib/gdpr-export.ts`: add `import { listAppointmentsForPatient, type AppointmentRow } from "@/lib/appointments";`, add `appointments: AppointmentRow[];` to `PatientExport`, fetch `const appointments = await listAppointmentsForPatient(patientId);` alongside the others, include `appointments` in the return, and `appointments: []` in the early `patient: null` return.

- [ ] **Step 7: Assert appointments in the export test**

In `test/gdpr-export.test.ts`, first test: after creating the patient add
```ts
    const { createAppointmentType, createAppointment } = await import("@/lib/appointments");
    const atId = await createAppointmentType({ name: "60m", durationMinutes: 60 });
    await createAppointment({ patientId: pid, appointmentTypeId: atId, startsAt: new Date(Date.now() + 86400000).toISOString(), createdBy: actor });
```
and assert `expect(out.appointments.length).toBeGreaterThan(0);`.

- [ ] **Step 8: Run tests, typecheck, full suite + commit**

```bash
npx vitest run test/appointments.test.ts test/gdpr-export.test.ts
npx tsc --noEmit
npm test
git add lib/schema.sql lib/appointments.ts lib/patients.ts lib/gdpr-export.ts test/appointments.test.ts test/gdpr-export.test.ts
git commit -m "feat: appointments model (book/list/status), erasure-safe, exported"
```

---

### Task 3: Appointments UI — list + book form + patient section

**Files:**
- Create: `app/appointments/page.tsx`
- Create: `app/appointments/actions.ts`
- Modify: `app/patients/[id]/page.tsx` (appointments section)
- Modify: `components/AppShell.tsx` (main nav link)

**Interfaces:**
- Produces: `bookAppointmentAction(formData: FormData)` → `createAppointment` + redirect/revalidate; `setStatusAction(id: number, status, backTo: string)` → `setAppointmentStatus` + revalidate.

- [ ] **Step 1: Create the appointment actions**

```ts
// app/appointments/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createAppointment, setAppointmentStatus } from "@/lib/appointments";

export async function bookAppointmentAction(formData: FormData) {
  const u = await requireUser();
  const patientId = Number(formData.get("patientId"));
  const appointmentTypeId = Number(formData.get("appointmentTypeId"));
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  if (!patientId || !appointmentTypeId || !date || !time) return;
  const startsAt = new Date(`${date}T${time}`).toISOString();
  await createAppointment({ patientId, appointmentTypeId, startsAt, practitionerId: u.userId, createdBy: u.userId });
  redirect("/appointments");
}

export async function setStatusAction(id: number, status: "completed" | "cancelled", backTo: string) {
  const u = await requireUser();
  await setAppointmentStatus(id, status, u.userId);
  revalidatePath(backTo);
}
```

- [ ] **Step 2: Create the appointments page**

```tsx
// app/appointments/page.tsx
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
```

- [ ] **Step 3: Appointments section on the patient page**

In `app/patients/[id]/page.tsx`, add `import { listAppointmentsForPatient } from "@/lib/appointments";` and `import { setStatusAction } from "@/app/appointments/actions";`, fetch `const appts = await listAppointmentsForPatient(id);`, and add a card after the Intake card:

```tsx
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Appointments</h2>
          <Link href="/appointments" className="btn--primary">Book</Link>
        </div>
        {appts.length === 0 ? <p className="muted">No appointments.</p> : appts.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{new Date(a.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {a.type_name ?? "—"} · <strong>{a.status}</strong></span>
            {a.status === "booked" ? (
              <form action={setStatusAction.bind(null, a.id, "cancelled", `/patients/${id}`)}><button className="btn--sm">Cancel</button></form>
            ) : null}
          </div>
        ))}
      </div>
```

- [ ] **Step 4: Add the main nav link**

In `components/AppShell.tsx`, in the base `items` array (all roles), add after the Patients line:

```ts
    { href: "/appointments", label: "Appointments", icon: "calendar" },
```

(If `calendar` is not a known icon, reuse `users` or another existing one.)

- [ ] **Step 5: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke (after `npm run migrate:all`): add an appointment type in admin → `/appointments` → book one for a patient → it shows under Upcoming and on the patient page; Cancel removes it from Upcoming.
```bash
git add "app/appointments/page.tsx" "app/appointments/actions.ts" "app/patients/[id]/page.tsx" components/AppShell.tsx
git commit -m "feat: appointments UI (list + book + patient section + nav)"
```

---

## Self-Review

**Spec coverage (Phase 2a):** appointment types (Task 1), appointments model + erasure + export (Task 2), booking/list/status UI + patient section + nav (Task 3). Availability + self-booking are 2b (correctly out of scope). ✓

**Placeholder scan:** No TBD/TODO. Tasks reference existing files precisely (nav arrays, patient-page card placement, export edits) with complete code for new files. The `calendar` icon has an explicit fallback note.

**Type consistency:** `AppointmentType`/`AppointmentRow` (Tasks 1/2) used by the pages/actions (Task 3) and the export (Task 2). `createAppointment` computes `ends_at` from `getAppointmentType(...).duration_minutes`. `setAppointmentStatus` status union matches the actions. Audit uses the existing `recordAudit` shape, entity `patient`, PII-free detail.

**Known follow-ups:** 2b availability + public self-booking; 2c reminders; 2d client portal. Double-booking prevention (slot conflicts) arrives with 2b's slot computation.
