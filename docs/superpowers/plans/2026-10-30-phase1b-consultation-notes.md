# Phase 1b — Clinical Consultation Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Per-patient dated consultation notes (date, title, free body, plus optional SOAP fields), shown as a timeline on the patient page with add/edit/delete, cleaned up on erasure and included in the GDPR export.

**Architecture:** A per-tenant `consultation_notes` table. `lib/consultation-notes.ts` provides CRUD (audited, PII-free detail). A notes timeline + "Add note" link on the patient page; dedicated new/edit note pages (the SOAP form is too big for the patient page). `deletePatient` and `exportPatientData` extend to cover notes.

**Tech Stack:** Next.js 14 (server actions), `@libsql/client`, `vitest`.

## Global Constraints

- New table in `lib/schema.sql` (CREATE TABLE IF NOT EXISTS) — picked up by `runMigrations`. No `;` inside SQL comments.
- Notes are per-tenant clinical data via tenant-aware `query`/`execute`.
- Note create/update/delete are audited (`lib/audit`), entity `patient`, **no PII in `detail`** (note date + id only — never title/body).
- `deletePatient` must remove the patient's notes (explicit delete, matching how it handles other child tables).
- Keep `npm test` green (currently 184).

---

### Task 1: Consultation-notes model

**Files:**
- Modify: `lib/schema.sql` (add `consultation_notes`)
- Create: `lib/consultation-notes.ts`
- Modify: `lib/patients.ts` (`deletePatient` removes notes)
- Test: `test/consultation-notes.test.ts`

**Interfaces:**
- Produces:
  - `type NoteInput = { noteDate: string; title?: string; body?: string; subjective?: string; objective?: string; assessment?: string; plan?: string; authorId?: number }`.
  - `type NoteRow = { id: number; patient_id: number; note_date: string; title: string | null; body: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; author_id: number | null; created_at: string; updated_at: string }`.
  - `createNote(patientId: number, input: NoteInput): Promise<number>` — audited `note_added`.
  - `updateNote(noteId: number, input: NoteInput): Promise<void>` — audited `note_updated`.
  - `getNote(noteId: number): Promise<NoteRow | null>`.
  - `listNotesForPatient(patientId: number): Promise<NoteRow[]>` — newest first (by note_date desc, then id desc).
  - `deleteNote(noteId: number, actorId?: number): Promise<void>` — audited `note_erased`.
- Consumes: `query`/`execute` (`@/lib/db`), `recordAudit` (`@/lib/audit`).

- [ ] **Step 1: Write the failing test**

```ts
// test/consultation-notes.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { createNote, updateNote, getNote, listNotesForPatient, deleteNote } from "@/lib/consultation-notes";
import { listAuditForEntity } from "@/lib/audit";

describe("consultation notes", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists (newest first), updates and deletes notes; audits each; PII-free", async () => {
    const pid = await createPatient({ name: "Notes P", dob: "1990-01-01" });
    const n1 = await createNote(pid, { noteDate: "2026-01-10", title: "Initial", body: "First visit", authorId: 1 });
    await createNote(pid, { noteDate: "2026-02-20", title: "Follow-up", subjective: "feels better", assessment: "improving" });

    const list = await listNotesForPatient(pid);
    expect(list).toHaveLength(2);
    expect(list[0].note_date).toBe("2026-02-20"); // newest first

    await updateNote(n1, { noteDate: "2026-01-10", title: "Initial (edited)", body: "First visit", plan: "retest in 8w" });
    const got = await getNote(n1);
    expect(got?.title).toBe("Initial (edited)");
    expect(got?.plan).toBe("retest in 8w");

    const audit = await listAuditForEntity("patient", pid);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain("note_added");
    expect(actions).toContain("note_updated");
    // No note body leaked into audit detail.
    expect(audit.map((a) => a.detail ?? "").join(" ")).not.toContain("First visit");

    await deleteNote(n1, 1);
    expect(await getNote(n1)).toBeNull();
    expect(await listNotesForPatient(pid)).toHaveLength(1);
  });

  it("deletePatient removes the patient's notes", async () => {
    const pid = await createPatient({ name: "Erase Notes", dob: "1990-01-01" });
    await createNote(pid, { noteDate: "2026-03-01", title: "X" });
    await deletePatient(pid, 1);
    expect(await listNotesForPatient(pid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/consultation-notes.test.ts`
Expected: FAIL — `@/lib/consultation-notes` not found.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql`, after the `patient_consents` table:

```sql
-- Dated clinical consultation notes. Free body plus optional SOAP fields.
CREATE TABLE IF NOT EXISTS consultation_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  note_date TEXT NOT NULL,
  title TEXT,
  body TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  author_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `lib/consultation-notes.ts`**

```ts
import { query, execute } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export type NoteInput = {
  noteDate: string; title?: string; body?: string;
  subjective?: string; objective?: string; assessment?: string; plan?: string;
  authorId?: number;
};

export type NoteRow = {
  id: number; patient_id: number; note_date: string;
  title: string | null; body: string | null;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null;
  author_id: number | null; created_at: string; updated_at: string;
};

const norm = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function createNote(patientId: number, input: NoteInput): Promise<number> {
  const rs = await execute(
    `INSERT INTO consultation_notes (patient_id, note_date, title, body, subjective, objective, assessment, plan, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, input.noteDate.trim(), norm(input.title), norm(input.body), norm(input.subjective), norm(input.objective), norm(input.assessment), norm(input.plan), input.authorId ?? null]
  );
  const id = Number(rs.lastInsertRowid);
  await recordAudit({ actorId: input.authorId, action: "note_added", entity: "patient", entityId: patientId, detail: `note ${id} (${input.noteDate.trim()})` });
  return id;
}

export async function updateNote(noteId: number, input: NoteInput): Promise<void> {
  await execute(
    `UPDATE consultation_notes SET note_date = ?, title = ?, body = ?, subjective = ?, objective = ?, assessment = ?, plan = ?, updated_at = datetime('now') WHERE id = ?`,
    [input.noteDate.trim(), norm(input.title), norm(input.body), norm(input.subjective), norm(input.objective), norm(input.assessment), norm(input.plan), noteId]
  );
  const row = (await query<{ patient_id: number }>("SELECT patient_id FROM consultation_notes WHERE id = ?", [noteId]))[0];
  if (row) await recordAudit({ actorId: input.authorId, action: "note_updated", entity: "patient", entityId: row.patient_id, detail: `note ${noteId}` });
}

export async function getNote(noteId: number): Promise<NoteRow | null> {
  const rows = await query<NoteRow>("SELECT * FROM consultation_notes WHERE id = ?", [noteId]);
  return rows[0] ?? null;
}

export async function listNotesForPatient(patientId: number): Promise<NoteRow[]> {
  return query<NoteRow>("SELECT * FROM consultation_notes WHERE patient_id = ? ORDER BY note_date DESC, id DESC", [patientId]);
}

export async function deleteNote(noteId: number, actorId?: number): Promise<void> {
  const row = (await query<{ patient_id: number }>("SELECT patient_id FROM consultation_notes WHERE id = ?", [noteId]))[0];
  await execute("DELETE FROM consultation_notes WHERE id = ?", [noteId]);
  if (row) await recordAudit({ actorId, action: "note_erased", entity: "patient", entityId: row.patient_id, detail: `note ${noteId}` });
}
```

- [ ] **Step 5: Remove notes on patient erasure**

In `lib/patients.ts`, inside `deletePatient`, add this to the `stmts` array immediately before the `patient_consents` delete:

```ts
  stmts.push({ sql: `DELETE FROM consultation_notes WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 6: Run test to verify it passes + full suite + commit**

```bash
npx vitest run test/consultation-notes.test.ts
npm test
git add lib/schema.sql lib/consultation-notes.ts lib/patients.ts test/consultation-notes.test.ts
git commit -m "feat: consultation-notes model (dated + SOAP, audited, erasure-safe)"
```

---

### Task 2: Include notes in the GDPR export

**Files:**
- Modify: `lib/gdpr-export.ts`
- Test: `test/gdpr-export.test.ts`

**Interfaces:**
- `PatientExport` gains `notes: NoteRow[]` (newest first).

- [ ] **Step 1: Extend the export**

In `lib/gdpr-export.ts`, add the import `import { listNotesForPatient } from "@/lib/consultation-notes";`, add `notes: Awaited<ReturnType<typeof listNotesForPatient>>;` to the `PatientExport` type, fetch `const notes = await listNotesForPatient(patientId);` alongside the other fetches, and include `notes` in the returned object (and in the early `patient: null` return, use `notes: []`).

- [ ] **Step 2: Assert notes in the export test**

In `test/gdpr-export.test.ts`, in the first test, after creating the patient add a note and assert it exports:

```ts
    const { createNote } = await import("@/lib/consultation-notes");
    await createNote(pid, { noteDate: "2026-01-01", title: "Visit" });
```
and after the existing assertions:
```ts
    expect(out.notes.some((n: { title: string | null }) => n.title === "Visit")).toBe(true);
```

- [ ] **Step 3: Run test, typecheck, full suite + commit**

```bash
npx vitest run test/gdpr-export.test.ts
npx tsc --noEmit
npm test
git add lib/gdpr-export.ts test/gdpr-export.test.ts
git commit -m "feat: include consultation notes in the GDPR export"
```

---

### Task 3: Notes timeline on the patient page + new-note page

**Files:**
- Create: `app/patients/[id]/notes/actions.ts`
- Create: `app/patients/[id]/notes/new/page.tsx`
- Modify: `app/patients/[id]/page.tsx` (render a notes timeline + "Add note" link)
- Test: none new (model covered in Task 1); verified in the browser.

**Interfaces:**
- Produces server actions: `createNoteAction(patientId: number, formData: FormData)` → `createNote` + `redirect(/patients/{id})`; `deleteNoteAction(patientId: number, noteId: number)` → `deleteNote` + `revalidatePath`.
- Consumes: `createNote`/`deleteNote`/`listNotesForPatient`, `requireUser`.

- [ ] **Step 1: Create the note actions**

```ts
// app/patients/[id]/notes/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createNote, updateNote, deleteNote } from "@/lib/consultation-notes";

function noteFromForm(formData: FormData) {
  return {
    noteDate: String(formData.get("noteDate") ?? "").trim(),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    subjective: String(formData.get("subjective") ?? ""),
    objective: String(formData.get("objective") ?? ""),
    assessment: String(formData.get("assessment") ?? ""),
    plan: String(formData.get("plan") ?? ""),
  };
}

export async function createNoteAction(patientId: number, formData: FormData) {
  const u = await requireUser();
  await createNote(patientId, { ...noteFromForm(formData), authorId: u.userId });
  redirect(`/patients/${patientId}`);
}

export async function updateNoteAction(patientId: number, noteId: number, formData: FormData) {
  const u = await requireUser();
  await updateNote(noteId, { ...noteFromForm(formData), authorId: u.userId });
  redirect(`/patients/${patientId}`);
}

export async function deleteNoteAction(patientId: number, noteId: number) {
  const u = await requireUser();
  await deleteNote(noteId, u.userId);
  revalidatePath(`/patients/${patientId}`);
}
```

- [ ] **Step 2: Create a reusable note form component**

```tsx
// app/patients/[id]/notes/NoteForm.tsx
import type { NoteRow } from "@/lib/consultation-notes";

export default function NoteForm({ action, note }: { action: (formData: FormData) => void; note?: NoteRow | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const ta = { width: "100%", minHeight: 70, padding: 8 } as const;
  return (
    <form action={action} className="stack" style={{ gap: 10, maxWidth: 640 }}>
      <div className="row" style={{ gap: 10 }}>
        <label className="stack" style={{ gap: 5 }}><span>Date</span><input name="noteDate" type="date" defaultValue={note?.note_date ?? today} required /></label>
        <label className="stack" style={{ gap: 5, flex: 1 }}><span>Title</span><input name="title" defaultValue={note?.title ?? ""} placeholder="e.g. Initial consultation" /></label>
      </div>
      <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="body" defaultValue={note?.body ?? ""} style={ta} placeholder="Free-text consultation notes…" /></label>
      <p className="muted-xs">Optional SOAP breakdown:</p>
      <label className="stack" style={{ gap: 5 }}><span>Subjective</span><textarea name="subjective" defaultValue={note?.subjective ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Objective</span><textarea name="objective" defaultValue={note?.objective ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Assessment</span><textarea name="assessment" defaultValue={note?.assessment ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Plan</span><textarea name="plan" defaultValue={note?.plan ?? ""} style={ta} /></label>
      <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save note</button>
    </form>
  );
}
```

- [ ] **Step 3: Create the new-note page**

```tsx
// app/patients/[id]/notes/new/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { notFound } from "next/navigation";
import NoteForm from "../NoteForm";
import { createNoteAction } from "../actions";

export default async function NewNotePage({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>New consultation note</h1>
      <div className="card">
        <NoteForm action={createNoteAction.bind(null, id)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render the notes timeline on the patient page**

In `app/patients/[id]/page.tsx`, add imports:

```tsx
import { listNotesForPatient } from "@/lib/consultation-notes";
import { deleteNoteAction } from "./notes/actions";
```

Fetch alongside the others: `const notes = await listNotesForPatient(id);`

Add a card (place after the Consent card):

```tsx
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Consultation notes</h2>
          <Link href={`/patients/${id}/notes/new`} className="btn--primary">+ Add note</Link>
        </div>
        {notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--border, #eee)", paddingTop: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <strong>{n.note_date}{n.title ? ` · ${n.title}` : ""}</strong>
                <span className="row" style={{ gap: 8 }}>
                  <Link href={`/patients/${id}/notes/${n.id}`}>Edit</Link>
                  <form action={deleteNoteAction.bind(null, id, n.id)}><button type="submit" className="btn">Delete</button></form>
                </span>
              </div>
              {n.body ? <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{n.body}</p> : null}
              {(n.subjective || n.objective || n.assessment || n.plan) ? (
                <dl className="muted-xs" style={{ margin: "6px 0 0" }}>
                  {n.subjective ? <><dt>S</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.subjective}</dd></> : null}
                  {n.objective ? <><dt>O</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.objective}</dd></> : null}
                  {n.assessment ? <><dt>A</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.assessment}</dd></> : null}
                  {n.plan ? <><dt>P</dt><dd style={{ whiteSpace: "pre-wrap" }}>{n.plan}</dd></> : null}
                </dl>
              ) : null}
            </div>
          ))
        )}
      </div>
```

- [ ] **Step 5: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
```
Smoke: open a patient → "+ Add note" → fill date/title/body → save → it appears in the timeline; Delete removes it.
```bash
git add "app/patients/[id]/notes/actions.ts" "app/patients/[id]/notes/new/page.tsx" "app/patients/[id]/notes/NoteForm.tsx" "app/patients/[id]/page.tsx"
git commit -m "feat: consultation-notes timeline + add/delete on the patient page"
```

---

### Task 4: Edit a note

**Files:**
- Create: `app/patients/[id]/notes/[noteId]/page.tsx`

**Interfaces:**
- An edit page that loads the note and posts to `updateNoteAction` (Task 3).

- [ ] **Step 1: Create the edit page**

```tsx
// app/patients/[id]/notes/[noteId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getNote } from "@/lib/consultation-notes";
import NoteForm from "../../NoteForm";
import { updateNoteAction } from "../../actions";

export default async function EditNotePage({ params }: { params: { id: string; noteId: string } }) {
  await requireUser();
  const id = Number(params.id);
  const noteId = Number(params.noteId);
  const [patient, note] = await Promise.all([getPatient(id), getNote(noteId)]);
  if (!patient || !note || note.patient_id !== id) notFound();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Link href={`/patients/${id}`}>← Back to {patient.name}</Link>
      <h1>Edit consultation note</h1>
      <div className="card">
        <NoteForm action={updateNoteAction.bind(null, id, noteId)} note={note} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + verify in browser + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke: on a patient with a note, click Edit → change the title → save → the timeline shows the updated title.
```bash
git add "app/patients/[id]/notes/[noteId]/page.tsx"
git commit -m "feat: edit a consultation note"
```

---

## Self-Review

**Spec coverage (Phase 1b):** dated notes + SOAP model (Task 1), export (Task 2), timeline + add/delete (Task 3), edit (Task 4). Erasure cleanup (Task 1 Step 5). ✓

**Placeholder scan:** No TBD/TODO. Task 2 describes the export edits precisely (import, type field, fetch, return) without duplicating the whole file; Tasks 3/4 give complete component/page code.

**Type consistency:** `NoteInput`/`NoteRow` (Task 1) used by the actions (Task 3), the form and pages (Tasks 3/4), and the export (Task 2). `createNoteAction`/`updateNoteAction` are `.bind(null, id[, noteId])` to match `<form action>`. Audit uses the existing `recordAudit` shape, entity `patient`, PII-free detail.

**Known follow-up:** 1c structured intake is the remaining Phase 1 piece; it extends the same patient page + export.
