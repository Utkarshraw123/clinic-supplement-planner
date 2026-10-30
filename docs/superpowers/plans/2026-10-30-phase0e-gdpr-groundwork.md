# Phase 0e — GDPR Groundwork (Consent + Audited Erasure + Data Export) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every tenant database the GDPR data-subject-rights primitives: a versioned, withdrawable consent record; an *audited* right-to-erasure; and a structured data export (portability/access) — all admin-gated and recorded in the existing audit log.

**Architecture:** Add a per-tenant `patient_consents` table (append-only, versioned) to the clinical schema. Add `lib/consent.ts` (record/withdraw/list/latest) that writes an audit event on every change. Make the existing `deletePatient` erasure record a PII-free audit event that *survives* the erasure (proof of erasure). Add `lib/gdpr-export.ts` building a full per-patient export object, exposed through an admin-only download route. No external services; runs entirely on existing resources.

**Tech Stack:** Next.js 14 (app router), `@libsql/client`, `vitest`, `tsx`. Builds on Phase 0a's tenant-aware `query`/`execute`.

## Global Constraints

- New clinical tables go in `lib/schema.sql` with `CREATE TABLE IF NOT EXISTS`; `scripts/migrate.ts` applies them (already runs every statement in the file). No separate migration file.
- All data access uses the existing `query`/`execute` from `@/lib/db` (tenant-aware since 0a). Do not call `getControlDb` here — GDPR data is per-tenant.
- Audit entries for erasure/export must contain **no patient PII** in `detail` (no name, dob, or email).
- `patient_consents` rows are **append-only**: a withdrawal is a new row with `granted = 0`, never an update/delete of the grant row. (They are removed only when the patient is erased.)
- Admin-gating uses the existing `requireAdmin()` from [lib/auth/current-user.ts](../../../lib/auth/current-user.ts).
- Run the suite with `npm test`; it must stay green (currently 153 tests).

---

### Task 1: Versioned consent model

**Files:**
- Modify: `lib/schema.sql` (add `patient_consents`)
- Create: `lib/consent.ts`
- Modify: `lib/patients.ts` (erase consent rows in `deletePatient`)
- Test: `test/consent.test.ts`

**Interfaces:**
- Produces:
  - `recordConsent(input: { patientId: number; purpose: string; version: string; actorId?: number }): Promise<void>` — inserts a `granted = 1` row and audits `consent_granted`.
  - `withdrawConsent(input: { patientId: number; purpose: string; actorId?: number }): Promise<void>` — inserts a `granted = 0` row and audits `consent_withdrawn`.
  - `listConsents(patientId: number): Promise<ConsentRow[]>` — full history, newest first.
  - `latestConsentByPurpose(patientId: number): Promise<Record<string, ConsentRow>>` — most recent row per purpose.
  - `type ConsentRow = { id: number; patient_id: number; purpose: string; granted: number; version: string; recorded_by: number | null; recorded_at: string }`.
- Consumes: `query`/`execute` (`@/lib/db`), `recordAudit` ([lib/audit.ts](../../../lib/audit.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/consent.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient } from "@/lib/patients";
import { recordConsent, withdrawConsent, listConsents, latestConsentByPurpose } from "@/lib/consent";
import { listAuditForEntity } from "@/lib/audit";

describe("patient consent (versioned, withdrawable)", () => {
  beforeAll(async () => { await runMigrations(); });

  it("records grant then withdrawal as separate rows, latest wins, and audits both", async () => {
    const actor = await createUser({ email: `c${Date.now()}@c.test`, password: "x", role: "admin", name: "C" });
    const pid = await createPatient({ name: "Consent P", dob: "1990-01-01", createdBy: actor });

    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1", actorId: actor });
    await withdrawConsent({ patientId: pid, purpose: "health_data_processing", actorId: actor });

    const history = await listConsents(pid);
    expect(history).toHaveLength(2);
    expect(history[0].granted).toBe(0); // newest first = the withdrawal

    const latest = await latestConsentByPurpose(pid);
    expect(latest["health_data_processing"].granted).toBe(0);

    const audit = await listAuditForEntity("patient", pid);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain("consent_granted");
    expect(actions).toContain("consent_withdrawn");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/consent.test.ts`
Expected: FAIL — `@/lib/consent` not found.

- [ ] **Step 3: Add the schema table**

Add to `lib/schema.sql` (after the `patient_attributes` table):

```sql
-- GDPR consent, append-only and versioned. A withdrawal is a NEW row with
-- granted=0; the grant row is never mutated. latest-per-purpose is the current
-- state. Removed only when the patient is erased.
CREATE TABLE IF NOT EXISTS patient_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0,1)),
  version TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `lib/consent.ts`**

```ts
import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type ConsentRow = {
  id: number;
  patient_id: number;
  purpose: string;
  granted: number;
  version: string;
  recorded_by: number | null;
  recorded_at: string;
};

export async function recordConsent(input: { patientId: number; purpose: string; version: string; actorId?: number }): Promise<void> {
  await execute(
    "INSERT INTO patient_consents (patient_id, purpose, granted, version, recorded_by) VALUES (?, ?, 1, ?, ?)",
    [input.patientId, input.purpose, input.version, input.actorId ?? null]
  );
  await recordAudit({ actorId: input.actorId, action: "consent_granted", entity: "patient", entityId: input.patientId, detail: `${input.purpose} (${input.version})` });
}

export async function withdrawConsent(input: { patientId: number; purpose: string; actorId?: number }): Promise<void> {
  const latest = await query<ConsentRow>(
    "SELECT * FROM patient_consents WHERE patient_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
    [input.patientId, input.purpose]
  );
  const version = latest[0]?.version ?? "n/a";
  await execute(
    "INSERT INTO patient_consents (patient_id, purpose, granted, version, recorded_by) VALUES (?, ?, 0, ?, ?)",
    [input.patientId, input.purpose, version, input.actorId ?? null]
  );
  await recordAudit({ actorId: input.actorId, action: "consent_withdrawn", entity: "patient", entityId: input.patientId, detail: input.purpose });
}

export async function listConsents(patientId: number): Promise<ConsentRow[]> {
  return query<ConsentRow>("SELECT * FROM patient_consents WHERE patient_id = ? ORDER BY id DESC", [patientId]);
}

export async function latestConsentByPurpose(patientId: number): Promise<Record<string, ConsentRow>> {
  const rows = await query<ConsentRow>("SELECT * FROM patient_consents WHERE patient_id = ? ORDER BY id ASC", [patientId]);
  const out: Record<string, ConsentRow> = {};
  for (const r of rows) out[r.purpose] = r; // ascending, so last write per purpose wins
  return out;
}
```

- [ ] **Step 5: Erase consent rows on patient deletion**

In `lib/patients.ts`, inside `deletePatient`, add this statement to the `stmts` array immediately before the `patient_attributes` delete:

```ts
  stmts.push({ sql: `DELETE FROM patient_consents WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/consent.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/schema.sql lib/consent.ts lib/patients.ts test/consent.test.ts
git commit -m "feat: versioned, withdrawable patient consent with audit"
```

---

### Task 2: Audit the right-to-erasure

**Files:**
- Modify: `lib/patients.ts` (`deletePatient` records a PII-free audit event)
- Test: `test/erasure-audit.test.ts`

**Interfaces:**
- Produces: `deletePatient(id: number, actorId?: number): Promise<void>` — same erasure as before, plus an audit event `{ action: "erased", entity: "patient", entityId: id, detail: "patient record erased (GDPR)" }` written AFTER the erasure batch, so it survives.
- Consumes: `recordAudit` ([lib/audit.ts](../../../lib/audit.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/erasure-audit.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient, deletePatient } from "@/lib/patients";
import { listAuditForEntity } from "@/lib/audit";

describe("right-to-erasure is audited and PII-free", () => {
  beforeAll(async () => { await runMigrations(); });

  it("leaves an 'erased' audit event with no patient PII after deletion", async () => {
    const actor = await createUser({ email: `e${Date.now()}@c.test`, password: "x", role: "admin", name: "E" });
    const pid = await createPatient({ name: "Erase McName", dob: "1988-02-02", createdBy: actor });

    await deletePatient(pid, actor);

    const audit = await listAuditForEntity("patient", pid);
    const erased = audit.find((a) => a.action === "erased");
    expect(erased).toBeTruthy();
    expect(erased!.actor_id).toBe(actor);
    // No name or dob leaked into the surviving audit detail.
    expect(erased!.detail ?? "").not.toContain("Erase McName");
    expect(erased!.detail ?? "").not.toContain("1988-02-02");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/erasure-audit.test.ts`
Expected: FAIL — `deletePatient` currently takes one argument and writes no `erased` event.

- [ ] **Step 3: Update `deletePatient`**

In `lib/patients.ts`, change the signature and append the audit after the batch. Add the import if not present: `import { recordAudit } from "@/lib/audit";`.

```ts
export async function deletePatient(id: number, actorId?: number): Promise<void> {
  // ... unchanged body that builds `stmts` and runs the batch ...
  await (await getActiveDb()).batch(stmts, "write");
  // Proof-of-erasure: survives because we never delete entity='patient' audit rows,
  // and carries no PII.
  await recordAudit({ actorId, action: "erased", entity: "patient", entityId: id, detail: "patient record erased (GDPR)" });
}
```

- [ ] **Step 4: Pass the actor through the erasure action**

In `app/patients/actions.ts`, find the server action that calls `deletePatient(...)`. It already resolves the current user (it's an admin-gated action). Pass the acting user's id as the second argument. If the action currently looks like:

```ts
await deletePatient(patientId);
```

change it to resolve the user and pass the id:

```ts
const u = await requireAdmin();
await deletePatient(patientId, u.userId);
```

(Keep whatever user-resolution the file already uses; if `requireAdmin()` is already called at the top of the action, reuse that value rather than calling it twice.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/erasure-audit.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/patients.ts app/patients/actions.ts test/erasure-audit.test.ts
git commit -m "feat: audit right-to-erasure (PII-free proof-of-erasure event)"
```

---

### Task 3: Patient data export (portability / access)

**Files:**
- Create: `lib/gdpr-export.ts`
- Test: `test/gdpr-export.test.ts`

**Interfaces:**
- Produces: `exportPatientData(patientId: number): Promise<PatientExport>` where
  ```ts
  type PatientExport = {
    exported_at: string;
    patient: { id: number; name: string; dob: string; created_at: string } | null;
    attributes: { taxonomy_term_id: number; attr_type: string; label: string }[];
    consents: ConsentRow[];
    plans: {
      id: number; status: string; created_at: string;
      items: { product_id: number; product_name: string; note: string | null; dosing: string | null; position: number }[];
      guide: Record<string, unknown> | null;
      snapshots: { id: number; sent_to_email: string | null; sent_at: string | null; frozen_json: unknown }[];
    }[];
    audit: { action: string; detail: string | null; created_at: string; actor_id: number | null }[];
  };
  ```
  `pdf_base64` is intentionally excluded (it is a rendering of `frozen_json`, which is included). Returns `patient: null` if the id does not exist.
- Consumes: `query` (`@/lib/db`), `ConsentRow`/`listConsents` ([lib/consent.ts](../../../lib/consent.ts)), `listAuditForEntity` ([lib/audit.ts](../../../lib/audit.ts)).

- [ ] **Step 1: Write the failing test**

```ts
// test/gdpr-export.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { recordConsent } from "@/lib/consent";
import { exportPatientData } from "@/lib/gdpr-export";

describe("patient data export", () => {
  beforeAll(async () => { await runMigrations(); });

  it("includes demographics, consents, plans with items, and audit; excludes pdf_base64", async () => {
    const stamp = Date.now();
    const actor = await createUser({ email: `x${stamp}@c.test`, password: "x", role: "admin", name: "X" });
    const brandId = await createBrand({ name: `Ex ${stamp}` });
    const productId = await createProduct({ brandId, name: "Ex Magnesium", form: "capsule" });
    const pid = await createPatient({ name: "Export P", dob: "1991-03-03", createdBy: actor });
    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1", actorId: actor });
    const planId = await getOrCreateDraftPlan(pid, actor);
    await addPlanItem(planId, productId);

    const out = await exportPatientData(pid);

    expect(out.patient?.name).toBe("Export P");
    expect(out.consents.some((c) => c.purpose === "health_data_processing")).toBe(true);
    expect(out.plans).toHaveLength(1);
    expect(out.plans[0].items[0].product_name).toBe("Ex Magnesium");
    expect(JSON.stringify(out)).not.toContain("pdf_base64");
  });

  it("returns patient:null for an unknown id", async () => {
    const out = await exportPatientData(99999999);
    expect(out.patient).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gdpr-export.test.ts`
Expected: FAIL — `@/lib/gdpr-export` not found.

- [ ] **Step 3: Create `lib/gdpr-export.ts`**

```ts
import { query } from "@/lib/db";
import { listConsents, type ConsentRow } from "@/lib/consent";
import { listAuditForEntity } from "@/lib/audit";

type PatientRow = { id: number; name: string; dob: string; created_at: string };

export type PatientExport = {
  exported_at: string;
  patient: PatientRow | null;
  attributes: { taxonomy_term_id: number; attr_type: string; label: string }[];
  consents: ConsentRow[];
  plans: {
    id: number; status: string; created_at: string;
    items: { product_id: number; product_name: string; note: string | null; dosing: string | null; position: number }[];
    guide: Record<string, unknown> | null;
    snapshots: { id: number; sent_to_email: string | null; sent_at: string | null; frozen_json: unknown }[];
  }[];
  audit: { action: string; detail: string | null; created_at: string; actor_id: number | null }[];
};

export async function exportPatientData(patientId: number): Promise<PatientExport> {
  const patient = (await query<PatientRow>("SELECT id, name, dob, created_at FROM patients WHERE id = ?", [patientId]))[0] ?? null;
  const exported_at = new Date().toISOString();
  if (!patient) {
    return { exported_at, patient: null, attributes: [], consents: [], plans: [], audit: [] };
  }

  const attributes = await query<{ taxonomy_term_id: number; attr_type: string; label: string }>(
    `SELECT pa.taxonomy_term_id, pa.attr_type, t.label
       FROM patient_attributes pa JOIN taxonomy_terms t ON t.id = pa.taxonomy_term_id
      WHERE pa.patient_id = ?`,
    [patientId]
  );

  const consents = await listConsents(patientId);
  const audit = await listAuditForEntity("patient", patientId);

  const planRows = await query<{ id: number; status: string; created_at: string }>(
    "SELECT id, status, created_at FROM plans WHERE patient_id = ? ORDER BY id",
    [patientId]
  );

  const plans: PatientExport["plans"] = [];
  for (const p of planRows) {
    const items = await query<{ product_id: number; product_name: string; note: string | null; dosing: string | null; position: number }>(
      `SELECT pi.product_id, pr.name AS product_name, pi.note,
              COALESCE(pi.dosing_custom_text, dp.text) AS dosing, pi.position
         FROM plan_items pi
         JOIN products pr ON pr.id = pi.product_id
         LEFT JOIN dosing_presets dp ON dp.id = pi.dosing_preset_id
        WHERE pi.plan_id = ? ORDER BY pi.position`,
      [p.id]
    );
    const guide = (await query<Record<string, unknown>>("SELECT * FROM plan_guide WHERE plan_id = ?", [p.id]))[0] ?? null;
    const snapRows = await query<{ id: number; sent_to_email: string | null; sent_at: string | null; frozen_json: string }>(
      "SELECT id, sent_to_email, sent_at, frozen_json FROM plan_snapshots WHERE plan_id = ? ORDER BY id",
      [p.id]
    );
    const snapshots = snapRows.map((s) => ({
      id: s.id,
      sent_to_email: s.sent_to_email,
      sent_at: s.sent_at,
      frozen_json: safeParse(s.frozen_json),
    }));
    plans.push({ id: p.id, status: p.status, created_at: p.created_at, items, guide, snapshots });
  }

  return { exported_at, patient, attributes, consents, plans, audit };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gdpr-export.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/gdpr-export.ts test/gdpr-export.test.ts
git commit -m "feat: per-patient GDPR data export (portability/access)"
```

---

### Task 4: Admin-only export download route

**Files:**
- Create: `app/api/gdpr/patient/[id]/export/route.ts`
- Test: `test/gdpr-export-route.test.ts`

**Interfaces:**
- Produces: `GET /api/gdpr/patient/:id/export` → admin-only; returns the `PatientExport` JSON as a downloadable attachment and records an audit event `{ action: "exported", entity: "patient", entityId: id, detail: "data export (GDPR)" }`.
- Consumes: `requireAdmin` ([lib/auth/current-user.ts](../../../lib/auth/current-user.ts)), `exportPatientData` (Task 3), `recordAudit` ([lib/audit.ts](../../../lib/audit.ts)).

- [ ] **Step 1: Write the route**

```ts
// app/api/gdpr/patient/[id]/export/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { exportPatientData } from "@/lib/gdpr-export";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const data = await exportPatientData(id);
  if (!data.patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit({ actorId: admin.userId, action: "exported", entity: "patient", entityId: id, detail: "data export (GDPR)" });

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="patient-${id}-export.json"`,
    },
  });
}
```

- [ ] **Step 2: Add a unit test for the export side-effect (audit)**

Because the route depends on `requireAdmin()` (request cookies), test the audited-export behaviour at the library level instead of over HTTP:

```ts
// test/gdpr-export-route.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createPatient } from "@/lib/patients";
import { exportPatientData } from "@/lib/gdpr-export";
import { recordAudit, listAuditForEntity } from "@/lib/audit";

// Mirrors what the route does after requireAdmin(): export + audit.
async function auditedExport(patientId: number, actorId: number) {
  const data = await exportPatientData(patientId);
  if (data.patient) await recordAudit({ actorId, action: "exported", entity: "patient", entityId: patientId, detail: "data export (GDPR)" });
  return data;
}

describe("audited export", () => {
  beforeAll(async () => { await runMigrations(); });
  it("records an 'exported' audit event with no PII", async () => {
    const actor = await createUser({ email: `r${Date.now()}@c.test`, password: "x", role: "admin", name: "R" });
    const pid = await createPatient({ name: "Route P", dob: "1990-01-01", createdBy: actor });
    await auditedExport(pid, actor);
    const audit = await listAuditForEntity("patient", pid);
    const ev = audit.find((a) => a.action === "exported");
    expect(ev).toBeTruthy();
    expect(ev!.detail ?? "").not.toContain("Route P");
  });
});
```

- [ ] **Step 3: Run tests + typecheck + full suite**

Run: `npx vitest run test/gdpr-export-route.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: all green.

- [ ] **Step 4: Manual smoke (dev)**

With the dev server running and signed in as the owner, open `/api/gdpr/patient/1/export` — it downloads `patient-1-export.json` with the patient's full record and no `pdf_base64`. Then check that an `exported` row appears in that patient's audit trail.

- [ ] **Step 5: Commit**

```bash
git add app/api/gdpr/patient/[id]/export/route.ts test/gdpr-export-route.test.ts
git commit -m "feat: admin-only GDPR patient export download route (audited)"
```

---

## Self-Review

**Spec coverage (spec §3.7 GDPR-by-design, Phase 0 slice):**
- Versioned, withdrawable consent → Task 1. ✓
- Per-tenant audit log extended to data-subject actions → Tasks 1, 2, 4 (consent, erasure, export all audited). ✓
- Data-subject export (portability/access) → Tasks 3, 4. ✓
- Erasure (already existed) made auditable + consent rows cleaned up → Tasks 1 (cleanup) + 2 (audit). ✓
- EU residency / encryption / sub-processor list → infrastructure items, not 0e code (tracked in spec; residency already via Dublin region).

**Placeholder scan:** No TBD/TODO. Every code step has complete code. Task 2 Step 4 references the existing server action generically because its exact surrounding code isn't duplicated here — the instruction gives the precise before/after line and the rule (reuse existing `requireAdmin()`), which is unambiguous.

**Type consistency:** `ConsentRow` defined in Task 1 is imported and reused in Tasks 3. `exportPatientData` returns `PatientExport` (Task 3) consumed by the route (Task 4). `deletePatient(id, actorId?)` new signature (Task 2) matches the call update in the same task. Audit calls everywhere use the existing `recordAudit` shape `{ actorId?, action, entity, entityId?, detail? }`.

**Known follow-ups (not 0e):** consent *capture UI* lands in Phase 1 intake; field-level encryption of clinical notes flagged for Phase 1; a control-plane (cross-tenant) login audit is a later add. Tenant-wide export/erasure (whole clinic) builds on these per-patient primitives in 0b/0e-later.
