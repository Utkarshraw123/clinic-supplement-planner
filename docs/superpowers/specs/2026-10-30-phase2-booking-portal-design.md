# Phase 2 — Booking + Reminders + Client Portal Design

**Date:** 2026-10-30
**Status:** Approved scope; building 2a
**Author:** Utkarsh + Claude (Opus 4.8)

## Context

After Phase 1 the app is a multi-tenant practice tool with a full client record (contact, consent, notes, intake) + the supplement planner. Phase 2 adds scheduling and a client-facing surface — the Timely replacement plus a patient portal.

## Decisions (approved)

- **Client-portal auth:** passwordless **magic link** (one-time email sign-in). Patient portal accounts live in the tenant DB. No patient passwords.
- **Reminders:** a cron endpoint sends due reminders (idempotent, mock-safe) via the existing Resend helper; one Vercel cron entry at deploy, manually triggerable in dev.
- **Portal v1:** view plans (download PDF) + patient-filled intake. Secure messaging deferred.
- **Booking:** appointment types + weekly availability + appointments (booked/completed/cancelled). Self-booking derives free slots from availability minus booked.

## Decomposition (sub-plans, in order)

- **2a — Appointments core** *(building now)*: appointment **types** (name, duration, optional price) + **appointments** model (patient, practitioner, type, start/end, status) + practitioner UI to book and manage appointments manually, and an appointments section on the patient page. *(Availability is NOT in 2a — manual booking needs no availability; it moves to 2b where slot computation needs it.)*
- **2b — Availability + client self-booking**: weekly availability model + a public per-clinic booking page that computes open slots (availability minus booked) and lets a client book.
- **2c — Reminders**: cron endpoint emailing reminders before appointments.
- **2d — Client portal**: magic-link patient login → view plans + fill intake.

## Cross-cutting

- All new data is per-tenant (clinical) via tenant-aware `query`/`execute`.
- Appointment create/cancel/status changes are audited (`lib/audit`, entity `patient`, PII-free detail).
- `deletePatient` and `exportPatientData` extend to cover appointments.
- Email reuses/extends `lib/email.ts` (Resend, mockable) for reminders + magic links.

## Testing

TDD per sub-plan: model functions first (types, appointment create computes end from duration, isolation/erasure), then UI verified in the browser preview.
