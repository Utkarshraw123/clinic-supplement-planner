# Phase 2c — Appointment Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Automated email reminders before appointments: a per-tenant "due reminders" query, a mock-safe reminder email, a cross-tenant runner, and a secret-protected cron endpoint (plus a Vercel cron entry) that sends reminders idempotently.

**Architecture:** Add `reminder_sent_at` to `appointments`. `lib/appointments.ts` gains `listDueReminders` + `markReminderSent`. `lib/email.ts` gains `sendReminderEmail` (mock-safe like `sendPlanEmail`). `lib/reminders.ts` has `sendDueRemindersForActiveTenant` (runs in the active tenant DB) and `runAllReminders` (loops every tenant via `runWithDb(getTenantDb)`). A cron route `/api/cron/reminders` (secret-checked, public in middleware) calls `runAllReminders`; `vercel.json` schedules it hourly.

**Tech Stack:** Next.js 14 (route handler), `@libsql/client`, `resend` (mock-safe), `vitest`.

## Global Constraints

- The cron runs with **no session** → it iterates tenants and wraps each tenant's work in `runWithDb(await getTenantDb(id))`.
- Reminders are **idempotent**: only appointments with `reminder_sent_at IS NULL`, `status='booked'`, and `starts_at` within the window are sent; each send sets `reminder_sent_at`.
- Email is **mock-safe**: no `RESEND_API_KEY` → logged, `mocked: true`, nothing actually sent.
- The cron endpoint requires a secret when `CRON_SECRET` is set (header `Authorization: Bearer <secret>` or `?key=`); in dev with no `CRON_SECRET` it is allowed.
- `reminder_sent_at` is added via `ensureColumn` (existing tenant DBs) and in the CREATE TABLE. No `;` inside SQL comments.
- Keep `npm test` green (currently 196).

---

### Task 1: Reminder data layer

**Files:**
- Modify: `lib/schema.sql` (add `reminder_sent_at` to `appointments`)
- Modify: `scripts/migrate.ts` (guarded `ensureColumn`)
- Modify: `lib/appointments.ts` (`listDueReminders`, `markReminderSent`)
- Test: `test/reminders-data.test.ts`

**Interfaces:**
- Produces:
  - `type DueReminder = { id: number; patient_id: number | null; patient_name: string | null; patient_email: string | null; starts_at: string; type_name: string | null }`.
  - `listDueReminders(withinHours?: number, now?: Date): Promise<DueReminder[]>` — `status='booked'`, `reminder_sent_at IS NULL`, `starts_at` in `(now, now+withinHours]`; default 24h.
  - `markReminderSent(appointmentId: number): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/reminders-data.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createAppointmentType, createAppointment } from "@/lib/appointments";
import { listDueReminders, markReminderSent } from "@/lib/appointments";

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
    // the +48h one is not due
    expect(due.every((d) => new Date(d.starts_at).getTime() <= Date.now() + 24 * 3600 * 1000)).toBe(true);

    await markReminderSent(aSoon);
    expect((await listDueReminders(24)).some((d) => d.id === aSoon)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reminders-data.test.ts`
Expected: FAIL — `listDueReminders`/`markReminderSent` not exported.

- [ ] **Step 3: Add the column (schema + guarded migration)**

In `lib/schema.sql`, add `reminder_sent_at TEXT,` to the `appointments` table (after `notes`).

In `scripts/migrate.ts`, in the `ensureColumn` block add:

```ts
  await ensureColumn("appointments", "reminder_sent_at", "TEXT");
```

- [ ] **Step 4: Add the functions to `lib/appointments.ts`**

```ts
export type DueReminder = { id: number; patient_id: number | null; patient_name: string | null; patient_email: string | null; starts_at: string; type_name: string | null };

export async function listDueReminders(withinHours = 24, now: Date = new Date()): Promise<DueReminder[]> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + withinHours * 60 * 60 * 1000).toISOString();
  return query<DueReminder>(
    `SELECT a.id, a.patient_id, p.name AS patient_name, p.email AS patient_email, a.starts_at, t.name AS type_name
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN appointment_types t ON t.id = a.appointment_type_id
      WHERE a.status = 'booked' AND a.reminder_sent_at IS NULL
        AND a.starts_at > ? AND a.starts_at <= ?
      ORDER BY a.starts_at ASC`,
    [from, to]
  );
}

export async function markReminderSent(appointmentId: number): Promise<void> {
  await execute("UPDATE appointments SET reminder_sent_at = datetime('now') WHERE id = ?", [appointmentId]);
}
```

- [ ] **Step 5: Run test to verify it passes + commit**

```bash
npx vitest run test/reminders-data.test.ts
npm test
git add lib/schema.sql scripts/migrate.ts lib/appointments.ts test/reminders-data.test.ts
git commit -m "feat: reminder data layer (due reminders + mark sent, idempotent)"
```

---

### Task 2: Reminder email + per-tenant and cross-tenant runners

**Files:**
- Modify: `lib/email.ts` (add `sendReminderEmail`)
- Create: `lib/reminders.ts`
- Test: `test/reminders-run.test.ts`

**Interfaces:**
- Produces: `sendReminderEmail(input: { to: string; from: string; clinicName: string; patientName: string; whenIso: string }): Promise<{ mocked: boolean }>` — mock-safe.
- Produces: `sendDueRemindersForActiveTenant(withinHours?: number): Promise<{ sent: number; skipped: number; mocked: boolean }>` — in the active tenant DB: for each due reminder with a patient email, send + `markReminderSent`; skip ones with no email.
- Produces: `runAllReminders(withinHours?: number): Promise<{ tenants: number; sent: number }>` — loops `listTenants()` and runs the per-tenant sender under `runWithDb`.
- Consumes: `listDueReminders`/`markReminderSent` (Task 1), `getClinicSettings` (`lib/settings`), `listTenants` (`lib/control-users`), `getTenantDb`/`runWithDb`.

- [ ] **Step 1: Write the failing test**

```ts
// test/reminders-run.test.ts
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
    // second run sends nothing new (idempotent)
    const r2 = await sendDueRemindersForActiveTenant(24);
    expect(r2.sent).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/reminders-run.test.ts`
Expected: FAIL — `@/lib/reminders` not found.

- [ ] **Step 3: Add `sendReminderEmail` to `lib/email.ts`**

```ts
export async function sendReminderEmail(input: { to: string; from: string; clinicName: string; patientName: string; whenIso: string }): Promise<{ mocked: boolean }> {
  const when = new Date(input.whenIso).toLocaleString();
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] reminder to ${input.to} for ${input.patientName} @ ${when}`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "appointments@example.com",
    to: input.to,
    subject: `Appointment reminder — ${input.clinicName}`,
    text: `Dear ${input.patientName},\n\nThis is a reminder of your appointment with ${input.clinicName} on ${when}.\n\nIf you need to reschedule, please get in touch.\n\nBest wishes,\n${input.clinicName}`,
  });
  return { mocked: false };
}
```

- [ ] **Step 4: Create `lib/reminders.ts`**

```ts
import { getTenantDb, runWithDb } from "@/lib/db";
import { listTenants } from "@/lib/control-users";
import { listDueReminders, markReminderSent } from "@/lib/appointments";
import { getClinicSettings } from "@/lib/settings";
import { sendReminderEmail } from "@/lib/email";

export async function sendDueRemindersForActiveTenant(withinHours = 24): Promise<{ sent: number; skipped: number; mocked: boolean }> {
  const settings = await getClinicSettings();
  const due = await listDueReminders(withinHours);
  let sent = 0, skipped = 0, mocked = false;
  for (const d of due) {
    if (!d.patient_email) { skipped++; continue; }
    const res = await sendReminderEmail({
      to: d.patient_email,
      from: settings.email_from ?? "",
      clinicName: settings.clinic_name ?? "Your clinic",
      patientName: d.patient_name ?? "there",
      whenIso: d.starts_at,
    });
    mocked = mocked || res.mocked;
    await markReminderSent(d.id);
    sent++;
  }
  return { sent, skipped, mocked };
}

export async function runAllReminders(withinHours = 24): Promise<{ tenants: number; sent: number }> {
  const tenants = await listTenants();
  let sent = 0;
  for (const t of tenants) {
    const client = await getTenantDb(t.id);
    const res = await runWithDb(client, () => sendDueRemindersForActiveTenant(withinHours));
    sent += res.sent;
  }
  return { tenants: tenants.length, sent };
}
```

- [ ] **Step 5: Run test to verify it passes + commit**

```bash
npx vitest run test/reminders-run.test.ts
npm test
git add lib/email.ts lib/reminders.ts test/reminders-run.test.ts
git commit -m "feat: reminder email (mock-safe) + per-tenant and cross-tenant runners"
```

---

### Task 3: Cron endpoint + Vercel cron

**Files:**
- Create: `app/api/cron/reminders/route.ts`
- Modify: `middleware.ts` (make `/api/cron` public)
- Modify: `vercel.json` (add the cron schedule)
- Modify: `.env.example` (document `CRON_SECRET`)

**Interfaces:**
- `GET /api/cron/reminders` → checks the secret, calls `runAllReminders`, returns JSON `{ ok, tenants, sent }`.

- [ ] **Step 1: Create the cron route**

```ts
// app/api/cron/reminders/route.ts
import { NextResponse } from "next/server";
import { runAllReminders } from "@/lib/reminders";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: no secret configured
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization");
  return bearer === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await runAllReminders(24);
  return NextResponse.json({ ok: true, ...res });
}
```

- [ ] **Step 2: Make `/api/cron` public in middleware**

In `middleware.ts`, add `"/api/cron"` to the `PUBLIC` array.

- [ ] **Step 3: Add the Vercel cron schedule**

In `vercel.json`, add a `crons` array:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["dub1"],
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 4: Document the secret**

In `.env.example`, add:

```
# Protects the reminders cron endpoint (/api/cron/reminders). Set the same value in Vercel.
CRON_SECRET=
```

- [ ] **Step 5: Typecheck, full suite, verify in dev + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke (after `npm run migrate:all`): book an appointment for a patient (with an email) starting within 24h, then visit `/api/cron/reminders` — the JSON shows `sent >= 1`; the server log shows the `[email mock] reminder…` line; a second visit shows `sent: 0` (idempotent); the appointment's reminder is not re-sent.
```bash
git add "app/api/cron/reminders/route.ts" middleware.ts vercel.json .env.example
git commit -m "feat: reminders cron endpoint (secret-protected) + Vercel cron schedule"
```

---

## Self-Review

**Spec coverage (Phase 2c):** reminder data layer (Task 1), mock-safe email + per-tenant and cross-tenant runners (Task 2), secret-protected cron endpoint + Vercel schedule (Task 3). ✓

**Placeholder scan:** No TBD/TODO. Complete code for new files; existing-file edits (schema column, migrate, middleware, vercel.json, .env.example) are precise.

**Type consistency:** `DueReminder` (Task 1) consumed by `sendDueRemindersForActiveTenant` (Task 2). `runAllReminders` loops `listTenants()` + `runWithDb(getTenantDb)` (no session), matching the global constraint. Email is mock-safe exactly like `sendPlanEmail`. Cron auth: allowed in dev (no secret), required when `CRON_SECRET` set.

**Idempotency + safety:** `reminder_sent_at` gate + `markReminderSent` after each send means no double-sends; `/api/cron` is public but secret-checked; nothing sends without `RESEND_API_KEY`.

**Known follow-ups:** 2d client portal (magic link). A configurable reminder window / multiple reminders (e.g. 24h + 1h) and retry-on-failure are future refinements.
