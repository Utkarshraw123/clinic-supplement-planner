# Phase 3 — AI Scribe + Meal Plans + Invoicing Design

**Date:** 2026-10-31
**Status:** Approved scope; building 3a (AI scribe), starting 3a-1
**Author:** Utkarsh + Claude (Opus 4.8)

## Context

After Phases 0–2 (merged to main) the app is a multi-tenant practice platform: CRM, notes, intake, consent, appointments, self-booking, reminders, client portal. Phase 3 adds the three remaining super-app pieces.

## Decisions (approved)

- **Build order:** AI consultation scribe first, then (later) client-facing invoicing, then meal plans.
- **Scribe audio:** record in browser → server transcription (Deepgram, pluggable) → Claude drafts a SOAP note → practitioner reviews/edits/signs off. The draft writes into the existing `consultation_notes` (Phase 1b).
- **Model:** Claude `claude-sonnet-5-5` for drafting (user-approved for cost); via `@anthropic-ai/sdk`.
- **Cost/keys:** everything is **mock-safe** — no `ANTHROPIC_API_KEY`/`DEEPGRAM_API_KEY` → deterministic mock output, so build/dev/test cost $0. Running live needs those keys (~$0.20–0.30/consult).
- **GDPR:** explicit recording consent (new `consultation_recording` purpose); **audio transcribed then discarded, never stored**; raw transcript not persisted (only the practitioner-approved note is saved); human-in-the-loop sign-off always. Positioned as "AI note-drafting you approve."

## Decomposition (3a — AI scribe)

- **3a-1 — AI providers, mock-safe** *(building now)*: `lib/ai/transcribe.ts` (`transcribeAudio`) + `lib/ai/scribe.ts` (`draftNoteFromTranscript` via Claude). Both return deterministic mocks with no key. Pure/unit-testable.
- **3a-2 — Consent gate + scribe endpoint**: `consultation_recording` consent purpose; a tenant-scoped, practitioner-authed upload→transcribe→draft endpoint (audio discarded, audited).
- **3a-3 — Recording UI**: in-browser recorder on the patient page → draft → prefilled note editor → sign off (save).

Later phases (own specs): **3b** client-facing invoicing (free Stripe test keys), **3c** meal plans (no external deps).

## Testing

TDD per sub-plan: AI providers tested in mock mode (no keys); endpoint + consent gate tested with injected mocks; UI verified in the browser preview.
