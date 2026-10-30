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
