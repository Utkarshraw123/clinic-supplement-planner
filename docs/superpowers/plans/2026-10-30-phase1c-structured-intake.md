# Phase 1c — Structured Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A single, editable, practitioner-entered intake record per patient (chief concern, health history, current medications, current supplements, lifestyle, goals), shown on the patient page, edited on a dedicated page, cleaned up on erasure, and included in the GDPR export.

**Architecture:** A per-tenant `patient_intake` table keyed by `patient_id` (one row per patient — upsert). `lib/intake.ts` provides get + save (audited, PII-free detail). A read-only intake summary + "Edit intake" link on the patient page; a dedicated intake edit page. `deletePatient` and `exportPatientData` extend to cover intake.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `vitest`.

## Global Constraints

- New table in `lib/schema.sql` (CREATE TABLE IF NOT EXISTS). No `;` inside SQL comments.
- Per-tenant clinical data via tenant-aware `query`/`execute`.
- Intake save is audited (`lib/audit`), entity `patient`, action `intake_updated`, **no PII in detail**.
- `deletePatient` removes the patient's intake (explicit delete).
- Keep `npm test` green (currently 186).

---

### Task 1: Intake model + erasure + export

**Files:**
- Modify: `lib/schema.sql` (add `patient_intake`)
- Create: `lib/intake.ts`
- Modify: `lib/patients.ts` (`deletePatient` removes intake)
- Modify: `lib/gdpr-export.ts` (include intake)
- Test: `test/intake.test.ts`, `test/gdpr-export.test.ts`

**Interfaces:**
- Produces:
  - `type IntakeInput = { chiefConcern?: string; healthHistory?: string; currentMedications?: string; currentSupplements?: string; lifestyle?: string; goals?: string; updatedBy?: number }`.
  - `type IntakeRow = { patient_id: number; chief_concern: string | null; health_history: string | null; current_medications: string | null; current_supplements: string | null; lifestyle: string | null; goals: string | null; updated_at: string; updated_by: number | null }`.
  - `getIntake(patientId: number): Promise<IntakeRow | null>`.
  - `saveIntake(patientId: number, input: IntakeInput): Promise<void>` — upsert, audited `intake_updated`.
- Consumes: `query`/`execute`, `recordAudit`.

- [ ] **Step 1: Write the failing test**

```ts
// test/intake.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { getIntake, saveIntake } from "@/lib/intake";
import { listAuditForEntity } from "@/lib/audit";

describe("patient intake", () => {
  beforeAll(async () => { await runMigrations(); });

  it("upserts a single intake row, reads it back, and audits (PII-free)", async () => {
    const pid = await createPatient({ name: "Intake P", dob: "1990-01-01" });
    expect(await getIntake(pid)).toBeNull();

    await saveIntake(pid, { chiefConcern: "Fatigue", goals: "More energy", currentMedications: "Levothyroxine", updatedBy: 1 });
    let i = await getIntake(pid);
    expect(i?.chief_concern).toBe("Fatigue");
    expect(i?.current_medications).toBe("Levothyroxine");

    // Save again = update in place (still one row).
    await saveIntake(pid, { chiefConcern: "Fatigue and poor sleep", goals: "More energy", updatedBy: 1 });
    i = await getIntake(pid);
    expect(i?.chief_concern).toBe("Fatigue and poor sleep");
    expect(i?.current_medications).toBeNull(); // not re-supplied → cleared on full save

    const audit = await listAuditForEntity("patient", pid);
    expect(audit.map((a) => a.action)).toContain("intake_updated");
    expect(audit.map((a) => a.detail ?? "").join(" ")).not.toContain("Levothyroxine");
  });

  it("deletePatient removes the intake", async () => {
    const pid = await createPatient({ name: "Erase Intake", dob: "1990-01-01" });
    await saveIntake(pid, { chiefConcern: "x" });
    await deletePatient(pid, 1);
    expect(await getIntake(pid)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/intake.test.ts`
Expected: FAIL — `@/lib/intake` not found.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql`, after the `consultation_notes` table:

```sql
-- One practitioner-entered intake record per patient (upserted).
CREATE TABLE IF NOT EXISTS patient_intake (
  patient_id INTEGER PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  chief_concern TEXT,
  health_history TEXT,
  current_medications TEXT,
  current_supplements TEXT,
  lifestyle TEXT,
  goals TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);
```

- [ ] **Step 4: Create `lib/intake.ts`**

```ts
import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type IntakeInput = {
  chiefConcern?: string; healthHistory?: string;
  currentMedications?: string; currentSupplements?: string;
  lifestyle?: string; goals?: string; updatedBy?: number;
};

export type IntakeRow = {
  patient_id: number;
  chief_concern: string | null; health_history: string | null;
  current_medications: string | null; current_supplements: string | null;
  lifestyle: string | null; goals: string | null;
  updated_at: string; updated_by: number | null;
};

const norm = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function getIntake(patientId: number): Promise<IntakeRow | null> {
  const rows = await query<IntakeRow>("SELECT * FROM patient_intake WHERE patient_id = ?", [patientId]);
  return rows[0] ?? null;
}

export async function saveIntake(patientId: number, input: IntakeInput): Promise<void> {
  await execute(
    `INSERT INTO patient_intake (patient_id, chief_concern, health_history, current_medications, current_supplements, lifestyle, goals, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(patient_id) DO UPDATE SET
       chief_concern=excluded.chief_concern, health_history=excluded.health_history,
       current_medications=excluded.current_medications, current_supplements=excluded.current_supplements,
       lifestyle=excluded.lifestyle, goals=excluded.goals,
       updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
    [patientId, norm(input.chiefConcern), norm(input.healthHistory), norm(input.currentMedications), norm(input.currentSupplements), norm(input.lifestyle), norm(input.goals), input.updatedBy ?? null]
  );
  await recordAudit({ actorId: input.updatedBy, action: "intake_updated", entity: "patient", entityId: patientId, detail: "intake saved" });
}
```

- [ ] **Step 5: Remove intake on patient erasure**

In `lib/patients.ts`, inside `deletePatient`, add to the `stmts` array immediately before the `consultation_notes` delete:

```ts
  stmts.push({ sql: `DELETE FROM patient_intake WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 6: Include intake in the GDPR export**

In `lib/gdpr-export.ts`: add `import { getIntake, type IntakeRow } from "@/lib/intake";`, add `intake: IntakeRow | null;` to `PatientExport`, fetch `const intake = await getIntake(patientId);` alongside the other fetches, include `intake` in the return, and use `intake: null` in the early `patient: null` return.

- [ ] **Step 7: Assert intake in the export test**

In `test/gdpr-export.test.ts`, first test: after creating the patient add `const { saveIntake } = await import("@/lib/intake"); await saveIntake(pid, { chiefConcern: "Fatigue" });` and assert `expect(out.intake?.chief_concern).toBe("Fatigue");`.

- [ ] **Step 8: Run tests, typecheck, full suite + commit**

```bash
npx vitest run test/intake.test.ts test/gdpr-export.test.ts
npx tsc --noEmit
npm test
git add lib/schema.sql lib/intake.ts lib/patients.ts lib/gdpr-export.ts test/intake.test.ts test/gdpr-export.test.ts
git commit -m "feat: patient intake model (upsert, audited, erasure-safe, exported)"
```

---

### Task 2: Intake UI — summary on patient page + edit page

**Files:**
- Create: `app/patients/[id]/intake/actions.ts`
- Create: `app/patients/[id]/intake/page.tsx`
- Modify: `app/patients/[id]/page.tsx` (intake summary card + Edit link)

**Interfaces:**
- Produces: `saveIntakeAction(patientId: number, formData: FormData)` → `saveIntake` + `redirect(/patients/{id})`.

- [ ] **Step 1: Create the intake action**

```ts
// app/patients/[id]/intake/actions.ts
"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { saveIntake } from "@/lib/intake";

export async function saveIntakeAction(patientId: number, formData: FormData) {
  const u = await requireUser();
  await saveIntake(patientId, {
    chiefConcern: String(formData.get("chiefConcern") ?? ""),
    healthHistory: String(formData.get("healthHistory") ?? ""),
    currentMedications: String(formData.get("currentMedications") ?? ""),
    currentSupplements: String(formData.get("currentSupplements") ?? ""),
    lifestyle: String(formData.get("lifestyle") ?? ""),
    goals: String(formData.get("goals") ?? ""),
    updatedBy: u.userId,
  });
  redirect(`/patients/${patientId}`);
}
```

- [ ] **Step 2: Create the intake edit page**

```tsx
// app/patients/[id]/intake/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getIntake } from "@/lib/intake";
import { saveIntakeAction } from "./actions";

const FIELDS: { name: string; label: string; key: keyof NonNullable<Awaited<ReturnType<typeof getIntake>>> }[] = [
  { name: "chiefConcern", label: "Chief concern", key: "chief_concern" },
  { name: "healthHistory", label: "Health history", key: "health_history" },
  { name: "currentMedications", label: "Current medications", key: "current_medications" },
  { name: "currentSupplements", label: "Current supplements", key: "current_supplements" },
  { name: "lifestyle", label: "Lifestyle", key: "lifestyle" },
  { name: "goals", label: "Goals", key: "goals" },
];

export default async function IntakePage({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const [patient, intake] = await Promise.all([getPatient(id), getIntake(id)]);
  if (!patient) notFound();
  const ta = { width: "100%", minHeight: 80, padding: 8 } as const;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>Intake — {patient.name}</h1>
      <div className="card">
        <form action={saveIntakeAction.bind(null, id)} className="stack" style={{ gap: 10, maxWidth: 680 }}>
          {FIELDS.map((f) => (
            <label key={f.name} className="stack" style={{ gap: 5 }}>
              <span>{f.label}</span>
              <textarea name={f.name} defaultValue={(intake?.[f.key] as string | null) ?? ""} style={ta} />
            </label>
          ))}
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save intake</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the intake summary card to the patient page**

In `app/patients/[id]/page.tsx`, add `import { getIntake } from "@/lib/intake";`, fetch `const intake = await getIntake(id);`, and add a card (place after the Consultation notes card):

```tsx
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Intake</h2>
          <Link href={`/patients/${id}/intake`} className="btn--primary">{intake ? "Edit intake" : "Add intake"}</Link>
        </div>
        {!intake ? (
          <p className="muted">No intake recorded yet.</p>
        ) : (
          <dl className="muted-xs" style={{ margin: 0 }}>
            {intake.chief_concern ? <><dt>Chief concern</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.chief_concern}</dd></> : null}
            {intake.health_history ? <><dt>Health history</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.health_history}</dd></> : null}
            {intake.current_medications ? <><dt>Current medications</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.current_medications}</dd></> : null}
            {intake.current_supplements ? <><dt>Current supplements</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.current_supplements}</dd></> : null}
            {intake.lifestyle ? <><dt>Lifestyle</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.lifestyle}</dd></> : null}
            {intake.goals ? <><dt>Goals</dt><dd style={{ whiteSpace: "pre-wrap" }}>{intake.goals}</dd></> : null}
          </dl>
        )}
      </div>
```

- [ ] **Step 4: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke: open a patient → "Add intake" → fill chief concern + goals → save → the summary card shows them; "Edit intake" reopens with the values prefilled.
```bash
git add "app/patients/[id]/intake/actions.ts" "app/patients/[id]/intake/page.tsx" "app/patients/[id]/page.tsx"
git commit -m "feat: patient intake summary + edit page"
```

---

## Self-Review

**Spec coverage (Phase 1c):** single editable intake model (Task 1), erasure + export (Task 1), summary + edit UI (Task 2). ✓ This completes Phase 1 (contact+consent 1a, notes 1b, intake 1c).

**Placeholder scan:** No TBD/TODO. Task 1 Step 6/7 and Task 2 Step 3 reference existing files precisely (import, field, fetch, return / card placement) without re-duplicating whole files.

**Type consistency:** `IntakeInput`/`IntakeRow` used by `saveIntake`/`getIntake`, the action (Task 2), the edit page and summary (Task 2), and the export (Task 1). `saveIntakeAction` is `.bind(null, id)` for `<form action>`. Upsert keyed on `patient_id` keeps exactly one row. Full-save semantics (unsupplied fields cleared) are asserted in the model test.

**Phase 1 done after this:** the patient record now carries contact, consent, consultation notes, and intake — the supplement planner attaches to a full clinical client record. Next milestone is Phase 2 (booking + portal).
