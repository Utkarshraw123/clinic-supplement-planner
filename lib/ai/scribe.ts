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
    return { title: "Consultation (AI draft)", subjective: text.trim(), objective: "", assessment: "", plan: "", mocked: false };
  }
}
