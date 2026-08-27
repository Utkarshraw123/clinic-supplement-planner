"use client";
import { useTransition } from "react";
import { deletePatientAction } from "@/app/patients/actions";

// Irreversible erasure — guarded by a native confirm naming the patient.
export default function DeletePatientButton({ patientId, patientName }: { patientId: number; patientName: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    const ok = window.confirm(
      `Permanently delete ${patientName} and ALL of their plans, guides and sent records?\n\n` +
      `This is for a data-erasure request and CANNOT be undone.`
    );
    if (!ok) return;
    start(async () => { await deletePatientAction(patientId); });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="btn--sm"
      aria-busy={pending}
      style={{ background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" }}
    >
      {pending ? "Deleting…" : "Delete patient permanently"}
    </button>
  );
}
