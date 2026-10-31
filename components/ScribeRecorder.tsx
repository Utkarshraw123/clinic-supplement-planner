"use client";
import { useRef, useState } from "react";

export default function ScribeRecorder({ patientId }: { patientId: number }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("working");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "consult.webm");
        fd.append("patientId", String(patientId));
        const res = await fetch("/api/scribe", { method: "POST", body: fd });
        if (!res.ok) { setError(res.status === 403 ? "Recording consent is required." : "Could not draft the note."); setState("idle"); return; }
        const json = await res.json();
        window.location.href = `/patients/${patientId}/notes/${json.noteId}`;
      };
      recRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setError("Microphone access was blocked.");
      setState("idle");
    }
  }
  function stop() { recRef.current?.stop(); }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {state === "idle" && <button type="button" className="btn--primary" onClick={start}>● Start AI scribe</button>}
      {state === "recording" && <button type="button" className="btn" onClick={stop}>■ Stop &amp; draft note</button>}
      {state === "working" && <span className="muted">Transcribing &amp; drafting…</span>}
      <p className="muted-xs">Records the consultation, drafts a note with AI, and opens it for your review. You always edit and save it yourself.</p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
