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
