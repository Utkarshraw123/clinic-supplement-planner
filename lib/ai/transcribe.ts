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
