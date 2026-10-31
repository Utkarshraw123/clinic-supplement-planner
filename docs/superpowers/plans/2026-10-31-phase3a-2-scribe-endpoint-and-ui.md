# Phase 3a-2/3 — Scribe Endpoint + Recording UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the mock-safe AI providers (3a-1) into a working scribe: a `consultation_recording` consent purpose, a tenant-scoped flow that transcribes audio → drafts a SOAP note → saves it as a draft consultation note (audio discarded, audited), an authed upload endpoint, and a browser recorder on the patient page that lands the practitioner in the note editor to review and sign off.

**Architecture:** `lib/scribe-flow.ts` `scribeConsultation(patientId, audio, actorId)` enforces recording consent, calls `transcribeAudio` + `draftNoteFromTranscript`, `createNote(...)` with the draft, audits `scribe_used`, returns the new note id. The audio buffer is never persisted. `app/api/scribe/route.ts` authenticates the practitioner session, parses the multipart upload, and calls the flow. A client `ScribeRecorder` component (MediaRecorder) on the patient page uploads the audio and redirects to the note editor. The recorder only renders when the patient has granted recording consent.

**Tech Stack:** Next.js 14 (route handler + client component), `@libsql/client`, `vitest`, browser `MediaRecorder`.

## Global Constraints

- **Audio is never stored** — it lives only in the request; after transcription it is discarded.
- Recording requires the `consultation_recording` consent; no consent → the flow throws and the UI is hidden.
- The flow is **mock-safe end to end** (no AI keys → mock transcript + mock draft), so it works in dev at zero cost.
- `scribeConsultation` audits `scribe_used` (entity `patient`, PII-free detail).
- Keep `npm test` green (currently 204).

---

### Task 1: Recording consent purpose + scribe flow

**Files:**
- Modify: `app/patients/[id]/consent-config.ts` (add the purpose)
- Create: `lib/scribe-flow.ts`
- Test: `test/scribe-flow.test.ts`

**Interfaces:**
- Produces: `scribeConsultation(input: { patientId: number; audio: Buffer; contentType?: string; actorId?: number }): Promise<{ noteId: number; mocked: boolean }>` — throws `Error("no_recording_consent")` if consent not granted.
- Consumes: `latestConsentByPurpose` (`lib/consent`), `transcribeAudio`/`draftNoteFromTranscript` (`lib/ai/*`), `createNote` (`lib/consultation-notes`), `recordAudit`.

- [ ] **Step 1: Write the failing test**

```ts
// test/scribe-flow.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { recordConsent } from "@/lib/consent";
import { getNote, listNotesForPatient } from "@/lib/consultation-notes";
import { listAuditForEntity } from "@/lib/audit";
import { scribeConsultation } from "@/lib/scribe-flow";

describe("scribeConsultation", () => {
  beforeAll(async () => { await runMigrations(); delete process.env.ANTHROPIC_API_KEY; delete process.env.DEEPGRAM_API_KEY; });

  it("requires recording consent", async () => {
    const pid = await createPatient({ name: "No Consent", dob: "1990-01-01" });
    await expect(scribeConsultation({ patientId: pid, audio: Buffer.from([1, 2, 3]), actorId: 1 }))
      .rejects.toThrow("no_recording_consent");
  });

  it("with consent, drafts a note (mock) and saves it; audits; audio not persisted", async () => {
    const pid = await createPatient({ name: "With Consent", dob: "1990-01-01" });
    await recordConsent({ patientId: pid, purpose: "consultation_recording", version: "v1", actorId: 1 });

    const res = await scribeConsultation({ patientId: pid, audio: Buffer.from([1, 2, 3, 4]), actorId: 1 });
    expect(res.mocked).toBe(true);
    const note = await getNote(res.noteId);
    expect(note?.patient_id).toBe(pid);
    expect((note?.title ?? "")).toContain("AI draft");
    expect((await listNotesForPatient(pid)).some((n) => n.id === res.noteId)).toBe(true);

    const actions = (await listAuditForEntity("patient", pid)).map((a) => a.action);
    expect(actions).toContain("scribe_used");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/scribe-flow.test.ts`
Expected: FAIL — `@/lib/scribe-flow` not found.

- [ ] **Step 3: Add the consent purpose**

In `app/patients/[id]/consent-config.ts`, add to `CONSENT_PURPOSES`:

```ts
  { key: "consultation_recording", label: "Recording consultations for AI note-drafting", version: "v1" },
```

- [ ] **Step 4: Create `lib/scribe-flow.ts`**

```ts
import { latestConsentByPurpose } from "@/lib/consent";
import { transcribeAudio } from "@/lib/ai/transcribe";
import { draftNoteFromTranscript } from "@/lib/ai/scribe";
import { createNote } from "@/lib/consultation-notes";
import { recordAudit } from "@/lib/audit";

export async function scribeConsultation(input: { patientId: number; audio: Buffer; contentType?: string; actorId?: number }): Promise<{ noteId: number; mocked: boolean }> {
  const consent = await latestConsentByPurpose(input.patientId);
  if (consent["consultation_recording"]?.granted !== 1) throw new Error("no_recording_consent");

  const t = await transcribeAudio(input.audio, input.contentType);
  const d = await draftNoteFromTranscript(t.text);
  const noteId = await createNote(input.patientId, {
    noteDate: new Date().toISOString().slice(0, 10),
    title: d.title,
    subjective: d.subjective,
    objective: d.objective,
    assessment: d.assessment,
    plan: d.plan,
    authorId: input.actorId,
  });
  await recordAudit({ actorId: input.actorId, action: "scribe_used", entity: "patient", entityId: input.patientId, detail: `note ${noteId}${t.mocked || d.mocked ? " (mock)" : ""}` });
  return { noteId, mocked: t.mocked || d.mocked };
}
```

(The `audio` buffer is never written anywhere — it is dropped when the function returns.)

- [ ] **Step 5: Run test to verify it passes + commit**

```bash
npx vitest run test/scribe-flow.test.ts
npm test
git add "app/patients/[id]/consent-config.ts" lib/scribe-flow.ts test/scribe-flow.test.ts
git commit -m "feat: scribe flow (consent-gated transcribe->draft->save note, audio discarded)"
```

---

### Task 2: Upload endpoint

**Files:**
- Create: `app/api/scribe/route.ts`

**Interfaces:**
- `POST /api/scribe` (multipart: `audio` file + `patientId`) → practitioner-authed → `scribeConsultation` → `{ noteId, mocked }` or an error status. Not public (session required; middleware already gates `/api`).

- [ ] **Step 1: Create the route**

```ts
// app/api/scribe/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { scribeConsultation } from "@/lib/scribe-flow";

export async function POST(req: Request) {
  const u = await requireUser();
  const form = await req.formData();
  const patientId = Number(form.get("patientId"));
  const file = form.get("audio");
  if (!patientId || !(file instanceof Blob)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const audio = Buffer.from(await file.arrayBuffer());
  try {
    const res = await scribeConsultation({ patientId, audio, contentType: file.type || "audio/webm", actorId: u.userId });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof Error && e.message === "no_recording_consent") {
      return NextResponse.json({ error: "no_recording_consent" }, { status: 403 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/api/scribe/route.ts"
git commit -m "feat: authed scribe upload endpoint (audio -> draft note)"
```

---

### Task 3: Recording UI on the patient page

**Files:**
- Create: `components/ScribeRecorder.tsx`
- Modify: `app/patients/[id]/page.tsx` (render the recorder when recording consent is granted)

**Interfaces:**
- `ScribeRecorder({ patientId }: { patientId: number })` — client component: Start/Stop recording via `MediaRecorder`, POST the blob to `/api/scribe`, then `window.location = /patients/${patientId}/notes/${noteId}`.

- [ ] **Step 1: Create the recorder component**

```tsx
// components/ScribeRecorder.tsx
"use client";
import { useRef, useState } from "react";

export default function ScribeRecorder({ patientId }: { patientId: number }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("working");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "consult.webm");
        fd.append("patientId", String(patientId));
        const res = await fetch("/api/scribe", { method: "POST", body: fd });
        if (!res.ok) { setError(res.status === 403 ? "Recording consent is required." : "Could not draft the note."); setState("idle"); return; }
        const json = await res.json();
        window.location.href = `/patients/${patientId}/notes/${json.noteId}`;
      };
      recRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setError("Microphone access was blocked.");
      setState("idle");
    }
  }
  function stop() { recRef.current?.stop(); }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {state === "idle" && <button type="button" className="btn--primary" onClick={start}>● Start AI scribe</button>}
      {state === "recording" && <button type="button" className="btn" onClick={stop}>■ Stop &amp; draft note</button>}
      {state === "working" && <span className="muted">Transcribing &amp; drafting…</span>}
      <p className="muted-xs">Records the consultation, drafts a note with AI, and opens it for your review. You always edit and save it yourself.</p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Render it on the patient page (consent-gated)**

In `app/patients/[id]/page.tsx`, add `import ScribeRecorder from "@/components/ScribeRecorder";`. Inside the "Consultation notes" card header area (near the "+ Add note" link), render the recorder when recording consent is granted:

```tsx
        {consent["consultation_recording"]?.granted === 1
          ? <ScribeRecorder patientId={id} />
          : <p className="muted-xs">Grant “Recording consultations…” consent above to use the AI scribe.</p>}
```

(Place this inside the Consultation notes card, below the header row. `consent` is already loaded on the page.)

- [ ] **Step 3: Typecheck, full suite, verify in browser + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke (mock mode, after `npm run migrate:all`): on a patient, grant the "Recording consultations…" consent → the "Start AI scribe" button appears → record a few seconds → it posts to `/api/scribe`, creates a draft note, and opens the note editor pre-filled with the mock SOAP draft → edit + save. Without consent, the button is replaced by the grant prompt. Confirm no audio is stored (only the note exists).
```bash
git add components/ScribeRecorder.tsx "app/patients/[id]/page.tsx"
git commit -m "feat: in-browser AI scribe recorder on the patient page (consent-gated)"
```

---

## Self-Review

**Spec coverage (3a-2/3):** consent purpose + consent-gated flow (Task 1), authed upload endpoint (Task 2), recording UI → note editor (Task 3). Audio discarded; human-in-the-loop sign-off (practitioner edits/saves the draft note). ✓ Completes a working mock-mode scribe.

**Placeholder scan:** No TBD/TODO. Complete code; patient-page edit is a precise insertion using the already-loaded `consent`.

**Type consistency:** `scribeConsultation` consumes `transcribeAudio`/`draftNoteFromTranscript` (3a-1) and `createNote` (1b); the endpoint and recorder use its `{ noteId, mocked }` result. The recorder redirects to the existing note edit page (`/patients/[id]/notes/[noteId]`).

**GDPR posture:** recording gated on explicit consent; audio never persisted; only the practitioner-reviewed note is saved; `scribe_used` audited. Positioned in the UI copy as "you always edit and save it yourself."

**Known follow-ups:** live run needs `ANTHROPIC_API_KEY` + `DEEPGRAM_API_KEY`; optional transcript retention and a dedicated "AI draft" note flag are later refinements. Then Phase 3b (invoicing) and 3c (meal plans).
