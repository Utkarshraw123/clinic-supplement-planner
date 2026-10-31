# Phase 1a — Client Contact Details + Consent UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the client record real contact details (email, phone, address), surface the Phase-0e consent model on the patient page, default the plan-send email from the stored email, and include contact details in the GDPR export.

**Architecture:** Add contact columns to the per-tenant `patients` table (guarded `ensureColumn` migration). Expand `createPatient`/`updatePatientBasics`/`getPatient` and the `PatientDetail` type. Add contact fields to the new + edit patient forms. Add a consent panel (server actions over `lib/consent`) to the patient page. Prefill the prepare-page email input from the patient's email. Extend `exportPatientData` to carry contact fields.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `vitest`.

## Global Constraints

- New patient columns are added in `lib/schema.sql` (CREATE TABLE stays authoritative for fresh DBs) **and** via `ensureColumn` in `scripts/migrate.ts` (for existing tenant DBs). Contact columns are nullable TEXT.
- No `;` inside SQL comments (migrator splits on `;`).
- Contact writes and consent grant/withdraw are audited (consent auditing already lives in `lib/consent`).
- `query`/`execute` are tenant-aware (Phase 0a) — no control-plane access here.
- Keep `npm test` green (currently 180).

---

### Task 1: Patient contact fields (model)

**Files:**
- Modify: `lib/schema.sql` (contact columns on `patients`)
- Modify: `scripts/migrate.ts` (guarded `ensureColumn` adds)
- Modify: `lib/patients.ts` (`PatientContact`, expand create/update/get)
- Test: `test/patient-contact.test.ts`

**Interfaces:**
- Produces: `type PatientContact = { email: string | null; phone: string | null; address1: string | null; address2: string | null; city: string | null; postcode: string | null }`.
- Changes: `PatientDetail` gains the `PatientContact` fields.
- Changes: `createPatient(input: { name; dob; createdBy?; } & Partial<PatientContact>)`.
- Changes: `updatePatientBasics(id, input: { name; dob } & Partial<PatientContact>)`.
- `getPatient` returns the contact fields.

- [ ] **Step 1: Write the failing test**

```ts
// test/patient-contact.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, getPatient, updatePatientBasics } from "@/lib/patients";

describe("patient contact details", () => {
  beforeAll(async () => { await runMigrations(); });

  it("stores and reads contact fields on create", async () => {
    const id = await createPatient({ name: "Contact P", dob: "1990-01-01", email: "p@x.test", phone: "0712345", address1: "1 High St", city: "Dublin", postcode: "D01" });
    const p = await getPatient(id);
    expect(p?.email).toBe("p@x.test");
    expect(p?.phone).toBe("0712345");
    expect(p?.address1).toBe("1 High St");
    expect(p?.city).toBe("Dublin");
    expect(p?.postcode).toBe("D01");
  });

  it("updates contact fields", async () => {
    const id = await createPatient({ name: "Edit P", dob: "1990-01-01" });
    await updatePatientBasics(id, { name: "Edit P", dob: "1990-01-01", email: "new@x.test", phone: "0799" });
    const p = await getPatient(id);
    expect(p?.email).toBe("new@x.test");
    expect(p?.phone).toBe("0799");
  });

  it("leaves contact fields null when omitted", async () => {
    const id = await createPatient({ name: "Bare P", dob: "1990-01-01" });
    const p = await getPatient(id);
    expect(p?.email).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/patient-contact.test.ts`
Expected: FAIL — contact fields undefined / columns missing.

- [ ] **Step 3: Add columns to the schema**

In `lib/schema.sql`, change the `patients` table to:

```sql
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  postcode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);
```

- [ ] **Step 4: Add guarded column migrations**

In `scripts/migrate.ts`, in the block of `ensureColumn` calls, add:

```ts
  await ensureColumn("patients", "email", "TEXT");
  await ensureColumn("patients", "phone", "TEXT");
  await ensureColumn("patients", "address1", "TEXT");
  await ensureColumn("patients", "address2", "TEXT");
  await ensureColumn("patients", "city", "TEXT");
  await ensureColumn("patients", "postcode", "TEXT");
```

- [ ] **Step 5: Expand `lib/patients.ts`**

Update the types and the three functions:

```ts
export type PatientContact = {
  email: string | null; phone: string | null;
  address1: string | null; address2: string | null;
  city: string | null; postcode: string | null;
};
export type PatientDetail = { id: number; name: string; dob: string; attributes: PatientAttr[] } & PatientContact;

function contactArgs(input: Partial<PatientContact>) {
  const norm = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  return [norm(input.email), norm(input.phone), norm(input.address1), norm(input.address2), norm(input.city), norm(input.postcode)];
}

export async function createPatient(input: { name: string; dob: string; createdBy?: number } & Partial<PatientContact>): Promise<number> {
  const rs = await execute(
    "INSERT INTO patients (name, dob, email, phone, address1, address2, city, postcode, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [input.name.trim(), input.dob.trim(), ...contactArgs(input), input.createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updatePatientBasics(id: number, input: { name: string; dob: string } & Partial<PatientContact>): Promise<void> {
  await execute(
    "UPDATE patients SET name = ?, dob = ?, email = ?, phone = ?, address1 = ?, address2 = ?, city = ?, postcode = ? WHERE id = ?",
    [input.name.trim(), input.dob.trim(), ...contactArgs(input), id]
  );
}
```

And in `getPatient`, select the contact columns and spread them into the return:

```ts
export async function getPatient(id: number): Promise<PatientDetail | null> {
  const base = await query<{ id: number; name: string; dob: string } & PatientContact>(
    "SELECT id, name, dob, email, phone, address1, address2, city, postcode FROM patients WHERE id = ?",
    [id]
  );
  if (!base[0]) return null;
  const attributes = await query<PatientAttr>(
    `SELECT t.id AS termId, t.label AS label, pa.attr_type AS attrType
     FROM patient_attributes pa JOIN taxonomy_terms t ON t.id = pa.taxonomy_term_id
     WHERE pa.patient_id = ?`, [id]
  );
  return { ...base[0], attributes };
}
```

- [ ] **Step 6: Run test to verify it passes + full suite + commit**

```bash
npx vitest run test/patient-contact.test.ts
npm test
git add lib/schema.sql scripts/migrate.ts lib/patients.ts test/patient-contact.test.ts
git commit -m "feat: patient contact details (email/phone/address) model"
```

---

### Task 2: Contact fields on the new + edit patient forms

**Files:**
- Modify: `app/patients/new/page.tsx`
- Modify: `app/patients/actions.ts` (read contact fields from FormData)
- Modify: `app/patients/[id]/page.tsx` (edit form shows/saves contact — locate the existing edit form / `updatePatientBasicsAction` call)

**Interfaces:**
- `createPatientAction` / the update action read `email`, `phone`, `address1`, `address2`, `city`, `postcode` from `FormData` and pass them through.

- [ ] **Step 1: Read the current actions**

Run: `sed -n '1,30p' app/patients/actions.ts` — note the exact names of the create and update server actions and how they build their input objects.

- [ ] **Step 2: Pass contact fields through the create action**

In `app/patients/actions.ts`, in the create action, extend the input object:

```ts
  await createPatient({
    name: String(formData.get("name") ?? ""),
    dob: String(formData.get("dob") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address1: String(formData.get("address1") ?? ""),
    address2: String(formData.get("address2") ?? ""),
    city: String(formData.get("city") ?? ""),
    postcode: String(formData.get("postcode") ?? ""),
    createdBy: u.userId,
  });
```

(Use the existing variable for the current user; keep whatever redirect/revalidate the action already does.) Apply the same `email`/`phone`/`address*` additions to the **update** action's `updatePatientBasics(...)` call.

- [ ] **Step 3: Add the fields to the new-patient form**

In `app/patients/new/page.tsx`, replace the helper line and add inputs after the DOB field:

```tsx
          <label className="stack" style={{ gap: 5 }}><span>Email <span className="muted-xs">(used to send plans)</span></span><input name="email" type="email" placeholder="client@email.com" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Phone</span><input name="phone" placeholder="07…" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address line 1</span><input name="address1" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address line 2</span><input name="address2" /></label>
          <div className="row" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>City</span><input name="city" /></label>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Postcode</span><input name="postcode" /></label>
          </div>
```

(Remove the old "Only name and date of birth are stored" helper line.)

- [ ] **Step 4: Add the fields to the edit form on the patient page**

In `app/patients/[id]/page.tsx`, find the edit form that posts to the update action and the `getPatient` result variable (e.g. `patient`). Add the same six inputs with `defaultValue` bound to the patient's stored values, e.g. `<input name="email" type="email" defaultValue={patient.email ?? ""} />`, mirroring the markup from Step 3.

- [ ] **Step 5: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
```
Smoke: create a patient with an email, reopen them, confirm the email persists in the edit form.
```bash
git add app/patients/new/page.tsx app/patients/actions.ts "app/patients/[id]/page.tsx"
git commit -m "feat: contact fields on new + edit patient forms"
```

---

### Task 3: Consent panel on the patient page

**Files:**
- Create: `app/patients/[id]/consent-actions.ts`
- Modify: `app/patients/[id]/page.tsx` (render consent state + grant/withdraw controls)
- Test: `test/consent-panel.test.ts`

**Interfaces:**
- Produces server actions: `grantConsentAction(patientId: number, purpose: string)` and `withdrawConsentAction(patientId: number, purpose: string)` — admin/practitioner gated, call `lib/consent`, revalidate the patient page.
- Produces: `CONSENT_PURPOSES` constant: `[{ key: "health_data_processing", label: "Health-data processing", version: "v1" }, { key: "marketing", label: "Marketing emails", version: "v1" }]`.
- Consumes: `recordConsent`/`withdrawConsent`/`latestConsentByPurpose` (`lib/consent`), `requireUser` (current-user).

- [ ] **Step 1: Write the failing test (the action resolver logic)**

```ts
// test/consent-panel.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { recordConsent, withdrawConsent, latestConsentByPurpose } from "@/lib/consent";
import { CONSENT_PURPOSES } from "@/app/patients/[id]/consent-actions";

describe("consent purposes + state", () => {
  beforeAll(async () => { await runMigrations(); });

  it("exposes the two purposes and reflects grant/withdraw state", async () => {
    expect(CONSENT_PURPOSES.map((p) => p.key)).toContain("health_data_processing");
    const pid = await createPatient({ name: "Consent UI", dob: "1990-01-01" });
    await recordConsent({ patientId: pid, purpose: "health_data_processing", version: "v1" });
    expect((await latestConsentByPurpose(pid))["health_data_processing"].granted).toBe(1);
    await withdrawConsent({ patientId: pid, purpose: "health_data_processing" });
    expect((await latestConsentByPurpose(pid))["health_data_processing"].granted).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/consent-panel.test.ts`
Expected: FAIL — `@/app/patients/[id]/consent-actions` not found.

- [ ] **Step 3: Create `app/patients/[id]/consent-actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { recordConsent, withdrawConsent } from "@/lib/consent";

export const CONSENT_PURPOSES = [
  { key: "health_data_processing", label: "Health-data processing", version: "v1" },
  { key: "marketing", label: "Marketing emails", version: "v1" },
] as const;

const VERSIONS: Record<string, string> = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p.key, p.version]));

export async function grantConsentAction(patientId: number, purpose: string): Promise<void> {
  const u = await requireUser();
  await recordConsent({ patientId, purpose, version: VERSIONS[purpose] ?? "v1", actorId: u.userId });
  revalidatePath(`/patients/${patientId}`);
}

export async function withdrawConsentAction(patientId: number, purpose: string): Promise<void> {
  const u = await requireUser();
  await withdrawConsent({ patientId, purpose, actorId: u.userId });
  revalidatePath(`/patients/${patientId}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/consent-panel.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the consent panel on the patient page**

In `app/patients/[id]/page.tsx`, add imports:

```tsx
import { latestConsentByPurpose } from "@/lib/consent";
import { CONSENT_PURPOSES, grantConsentAction, withdrawConsentAction } from "./consent-actions";
```

Load the state alongside the existing patient fetch (e.g. near where `getPatient` is awaited):

```tsx
  const consent = await latestConsentByPurpose(patientId);
```

Add a card to the page body (place near the patient details block, matching existing `card`/`stack` classes):

```tsx
      <div className="card stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Consent</h2>
        {CONSENT_PURPOSES.map((p) => {
          const granted = consent[p.key]?.granted === 1;
          return (
            <div key={p.key} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span>{p.label}: <strong>{granted ? "Granted" : "Not granted"}</strong>
                {consent[p.key]?.recorded_at ? <span className="muted-xs"> · {new Date(consent[p.key].recorded_at).toLocaleDateString()}</span> : null}
              </span>
              {granted ? (
                <form action={withdrawConsentAction.bind(null, patientId, p.key)}><button type="submit" className="btn">Withdraw</button></form>
              ) : (
                <form action={grantConsentAction.bind(null, patientId, p.key)}><button type="submit" className="btn--primary">Record consent</button></form>
              )}
            </div>
          );
        })}
      </div>
```

(If `patientId` is derived differently on the page, use the page's existing id variable. Match the page's existing `params` handling.)

- [ ] **Step 6: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
```
Smoke: open a patient, click "Record consent" for health-data processing → shows "Granted" with today's date; "Withdraw" flips it back.
```bash
git add "app/patients/[id]/consent-actions.ts" "app/patients/[id]/page.tsx" test/consent-panel.test.ts
git commit -m "feat: consent panel on the patient page (grant/withdraw, audited)"
```

---

### Task 4: Default the plan-send email + export contact

**Files:**
- Modify: `app/plan/[patientId]/prepare/page.tsx` (prefill email input)
- Modify: `lib/gdpr-export.ts` (include contact fields)
- Test: `test/gdpr-export.test.ts` (assert contact present)

**Interfaces:**
- `exportPatientData.patient` includes the `PatientContact` fields.

- [ ] **Step 1: Prefill the send email from the patient**

In `app/plan/[patientId]/prepare/page.tsx`, the page already awaits `getPatient(patientId)` into a `patient` variable. Change the email input (currently `<input name="email" type="email" placeholder="client@email.com" ... />`) to add `defaultValue={patient?.email ?? ""}`.

- [ ] **Step 2: Include contact in the GDPR export**

In `lib/gdpr-export.ts`, change the `PatientRow` type and the patient SELECT to include the contact columns:

```ts
type PatientRow = { id: number; name: string; dob: string; created_at: string; email: string | null; phone: string | null; address1: string | null; address2: string | null; city: string | null; postcode: string | null };
```
and
```ts
  const patient = (await query<PatientRow>("SELECT id, name, dob, created_at, email, phone, address1, address2, city, postcode FROM patients WHERE id = ?", [patientId]))[0] ?? null;
```

- [ ] **Step 3: Assert contact in the export test**

In `test/gdpr-export.test.ts`, in the first test, create the patient with an email and assert it exports:

Change the patient creation to `const pid = await createPatient({ name: "Export P", dob: "1991-03-03", email: "export@x.test", createdBy: actor });` and add after the `patient?.name` assertion:

```ts
    expect((out.patient as any)?.email).toBe("export@x.test");
```

- [ ] **Step 4: Run tests, typecheck, full suite, verify in browser + commit**

```bash
npx vitest run test/gdpr-export.test.ts
npx tsc --noEmit
npm test
```
Smoke: on a patient with an email, open the plan prepare page → the Client email field is pre-filled.
```bash
git add "app/plan/[patientId]/prepare/page.tsx" lib/gdpr-export.ts test/gdpr-export.test.ts
git commit -m "feat: default plan-send email from patient; export contact fields"
```

---

## Self-Review

**Spec coverage (Phase 1a):** contact columns + model (Task 1), contact on forms (Task 2), consent panel (Task 3), send-default + export contact (Task 4). ✓ All of 1a's spec bullets covered.

**Placeholder scan:** No TBD/TODO. Tasks 2 & 3 reference the existing actions/edit-form generically because their exact surrounding markup isn't duplicated here; each gives the precise field names, the code to add, and how to locate the insertion point. Task 1's model code is complete.

**Type consistency:** `PatientContact` (Task 1) flows into `PatientDetail`, `createPatient`/`updatePatientBasics` inputs, `getPatient` output, the forms (Task 2), the prepare prefill and the export `PatientRow` (Task 4). `CONSENT_PURPOSES` keys match `lib/consent` purposes. Actions use `requireUser().userId` (the tenant-local id from Phase 0b).

**Known follow-ups (1b/1c):** consultation notes and intake extend the same patient page and the GDPR export; deferred to their sub-plans.
