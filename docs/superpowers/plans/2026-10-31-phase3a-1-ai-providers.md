# Phase 3a-1 — AI Providers (Mock-Safe) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two mock-safe AI building blocks for the scribe: `transcribeAudio` (audio → text, Deepgram-backed) and `draftNoteFromTranscript` (text → SOAP note draft, Claude-backed). With no API keys they return deterministic mocks, so everything builds, tests, and demos at zero cost.

**Architecture:** `lib/ai/transcribe.ts` posts audio bytes to Deepgram's REST API when `DEEPGRAM_API_KEY` is set, else returns a deterministic mock transcript. `lib/ai/scribe.ts` calls Claude (`@anthropic-ai/sdk`, `claude-sonnet-5-5`) to draft a structured SOAP note when `ANTHROPIC_API_KEY` is set, else returns a deterministic mock draft. Both are pure functions of their inputs (no DB), fully unit-testable in mock mode.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, `fetch` (Deepgram REST), `vitest`.

## Global Constraints

- **Mock-safe:** absence of the relevant key → deterministic mock, `mocked: true`, no network. Never throw just because a key is missing.
- Keys read from env: `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`. Never hard-code or log them.
- Claude model: `claude-sonnet-5-5` (user-approved). Keep `max_tokens` modest (notes are short) and ask for strict JSON; parse tolerantly with a fallback.
- No DB access in these modules (pure AI I/O). Keep `npm test` green (currently 201).

---

### Task 1: `draftNoteFromTranscript` (Claude, mock-safe)

**Files:**
- Create: `lib/ai/scribe.ts`
- Test: `test/ai-scribe.test.ts`

**Interfaces:**
- Produces:
  - `type NoteDraft = { title: string; subjective: string; objective: string; assessment: string; plan: string; mocked: boolean }`.
  - `draftNoteFromTranscript(transcript: string): Promise<NoteDraft>`.

- [ ] **Step 1: Write the failing test (mock mode — no ANTHROPIC_API_KEY)**

```ts
// test/ai-scribe.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { draftNoteFromTranscript } from "@/lib/ai/scribe";

describe("draftNoteFromTranscript (mock mode)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; });

  it("returns a deterministic SOAP draft with mocked:true and no network", async () => {
    const d = await draftNoteFromTranscript("Patient reports tiredness and poor sleep. BP 120/80. Start magnesium.");
    expect(d.mocked).toBe(true);
    expect(d.title.length).toBeGreaterThan(0);
    expect(d.subjective.length).toBeGreaterThan(0);
    expect(d.plan.length).toBeGreaterThan(0);
    // deterministic for the same input
    const d2 = await draftNoteFromTranscript("Patient reports tiredness and poor sleep. BP 120/80. Start magnesium.");
    expect(d2.subjective).toBe(d.subjective);
  });

  it("handles an empty transcript without throwing", async () => {
    const d = await draftNoteFromTranscript("");
    expect(d.mocked).toBe(true);
    expect(typeof d.title).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai-scribe.test.ts`
Expected: FAIL — `@/lib/ai/scribe` not found.

- [ ] **Step 3: Create `lib/ai/scribe.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";

export type NoteDraft = { title: string; subjective: string; objective: string; assessment: string; plan: string; mocked: boolean };

const SYSTEM = [
  "You are a clinical scribe for a nutrition / functional-medicine practitioner.",
  "From the consultation transcript, draft a concise consultation note.",
  "Return ONLY a JSON object with these string fields: title, subjective, objective, assessment, plan.",
  "Use the practitioner's clinical voice. Do not invent facts not present in the transcript.",
  "If the transcript is empty or unusable, return empty strings for the fields and a title of 'Consultation'.",
].join(" ");

function mockDraft(transcript: string): NoteDraft {
  const first = transcript.trim().split(/[.?!\n]/)[0]?.trim() || "Consultation";
  return {
    title: `Consultation (AI draft)`,
    subjective: transcript.trim() ? `[AI draft — review] ${first}.` : "",
    objective: "",
    assessment: transcript.trim() ? "[AI draft — review] Assessment to be confirmed by the practitioner." : "",
    plan: transcript.trim() ? "[AI draft — review] Plan to be confirmed by the practitioner." : "",
    mocked: true,
  };
}

function coerce(obj: any, mocked: boolean): NoteDraft {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    title: s(obj?.title) || "Consultation",
    subjective: s(obj?.subjective),
    objective: s(obj?.objective),
    assessment: s(obj?.assessment),
    plan: s(obj?.plan),
    mocked,
  };
}

export async function draftNoteFromTranscript(transcript: string): Promise<NoteDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return mockDraft(transcript);

  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: `Consultation transcript:\n\n${transcript}` }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : {};
    return coerce(json, false);
  } catch {
    // Fallback: put the model's prose in the note body-equivalent fields.
    return { title: "Consultation (AI draft)", subjective: text.trim(), objective: "", assessment: "", plan: "", mocked: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes + commit**

```bash
npx vitest run test/ai-scribe.test.ts
git add lib/ai/scribe.ts test/ai-scribe.test.ts package.json package-lock.json
git commit -m "feat: mock-safe Claude note-drafting (draftNoteFromTranscript)"
```

---

### Task 2: `transcribeAudio` (Deepgram, mock-safe)

**Files:**
- Create: `lib/ai/transcribe.ts`
- Test: `test/ai-transcribe.test.ts`

**Interfaces:**
- Produces:
  - `type Transcription = { text: string; mocked: boolean }`.
  - `transcribeAudio(audio: Buffer, contentType?: string): Promise<Transcription>`.

- [ ] **Step 1: Write the failing test (mock mode — no DEEPGRAM_API_KEY)**

```ts
// test/ai-transcribe.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { transcribeAudio } from "@/lib/ai/transcribe";

describe("transcribeAudio (mock mode)", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.DEEPGRAM_API_KEY; delete process.env.DEEPGRAM_API_KEY; });
  afterEach(() => { if (saved !== undefined) process.env.DEEPGRAM_API_KEY = saved; });

  it("returns a deterministic mock transcript with mocked:true, no network", async () => {
    const t = await transcribeAudio(Buffer.from([1, 2, 3, 4]), "audio/webm");
    expect(t.mocked).toBe(true);
    expect(t.text.length).toBeGreaterThan(0);
    // deterministic for the same input size
    const t2 = await transcribeAudio(Buffer.from([1, 2, 3, 4]), "audio/webm");
    expect(t2.text).toBe(t.text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai-transcribe.test.ts`
Expected: FAIL — `@/lib/ai/transcribe` not found.

- [ ] **Step 3: Create `lib/ai/transcribe.ts`**

```ts
export type Transcription = { text: string; mocked: boolean };

function mockTranscript(audio: Buffer): string {
  // Deterministic placeholder so the pipeline works end-to-end with no key.
  return `[mock transcript — ${audio.length} bytes of audio] Practitioner and patient discussed the patient's main concerns, history, and next steps. Replace this by setting DEEPGRAM_API_KEY to transcribe real audio.`;
}

export async function transcribeAudio(audio: Buffer, contentType = "audio/webm"): Promise<Transcription> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { text: mockTranscript(audio), mocked: true };

  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
    body: audio,
  });
  if (!res.ok) throw new Error(`Deepgram error ${res.status}`);
  const json: any = await res.json();
  const text: string = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return { text, mocked: false };
}
```

> Confirm Deepgram's response path (`results.channels[0].alternatives[0].transcript`) against current docs when the key is in hand; the mock path needs no network.

- [ ] **Step 4: Run test to verify it passes + full suite + commit**

```bash
npx vitest run test/ai-transcribe.test.ts
npx tsc --noEmit
npm test
git add lib/ai/transcribe.ts test/ai-transcribe.test.ts
git commit -m "feat: mock-safe Deepgram transcription (transcribeAudio)"
```

---

## Self-Review

**Spec coverage (3a-1):** `draftNoteFromTranscript` (Task 1) + `transcribeAudio` (Task 2), both mock-safe. ✓ Feeds 3a-2 (endpoint) and 3a-3 (UI).

**Placeholder scan:** No TBD/TODO. The Deepgram response-path note is a known external-API caveat (mock path needs no network), not a code placeholder.

**Type consistency:** `NoteDraft` and `Transcription` are the only exported shapes; 3a-2 will consume both. No DB access here. Claude call uses `claude-sonnet-5-5` with `output_config.effort: "low"` (bounded, cheap) and tolerant JSON parsing.

**Cost/GDPR posture:** zero cost without keys; no audio or transcript is persisted in these modules (they're pure I/O) — storage decisions live in 3a-2/3a-3 (audio discarded, only the approved note saved).

**Known follow-ups:** 3a-2 (consent gate + upload→transcribe→draft endpoint, audited, tenant-scoped), 3a-3 (recording UI → prefilled note editor → sign off). Running live needs `ANTHROPIC_API_KEY` + `DEEPGRAM_API_KEY`.
