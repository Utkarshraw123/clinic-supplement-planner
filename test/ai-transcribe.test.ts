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
    const t2 = await transcribeAudio(Buffer.from([1, 2, 3, 4]), "audio/webm");
    expect(t2.text).toBe(t.text);
  });
});
