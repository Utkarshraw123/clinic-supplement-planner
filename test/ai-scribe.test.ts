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
    const d2 = await draftNoteFromTranscript("Patient reports tiredness and poor sleep. BP 120/80. Start magnesium.");
    expect(d2.subjective).toBe(d.subjective);
  });

  it("handles an empty transcript without throwing", async () => {
    const d = await draftNoteFromTranscript("");
    expect(d.mocked).toBe(true);
    expect(typeof d.title).toBe("string");
  });
});
