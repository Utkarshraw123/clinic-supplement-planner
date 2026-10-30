import type { NoteRow } from "@/lib/consultation-notes";

export default function NoteForm({ action, note }: { action: (formData: FormData) => void; note?: NoteRow | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const ta = { width: "100%", minHeight: 70, padding: 8 } as const;
  return (
    <form action={action} className="stack" style={{ gap: 10, maxWidth: 640 }}>
      <div className="row" style={{ gap: 10 }}>
        <label className="stack" style={{ gap: 5 }}><span>Date</span><input name="noteDate" type="date" defaultValue={note?.note_date ?? today} required /></label>
        <label className="stack" style={{ gap: 5, flex: 1 }}><span>Title</span><input name="title" defaultValue={note?.title ?? ""} placeholder="e.g. Initial consultation" /></label>
      </div>
      <label className="stack" style={{ gap: 5 }}><span>Notes</span><textarea name="body" defaultValue={note?.body ?? ""} style={ta} placeholder="Free-text consultation notes…" /></label>
      <p className="muted-xs">Optional SOAP breakdown:</p>
      <label className="stack" style={{ gap: 5 }}><span>Subjective</span><textarea name="subjective" defaultValue={note?.subjective ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Objective</span><textarea name="objective" defaultValue={note?.objective ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Assessment</span><textarea name="assessment" defaultValue={note?.assessment ?? ""} style={ta} /></label>
      <label className="stack" style={{ gap: 5 }}><span>Plan</span><textarea name="plan" defaultValue={note?.plan ?? ""} style={ta} /></label>
      <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save note</button>
    </form>
  );
}
