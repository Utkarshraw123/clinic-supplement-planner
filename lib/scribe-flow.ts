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
