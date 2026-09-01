"use client";
import { useTransition } from "react";
import { deletePlanAction } from "@/app/plans/actions";

// Discard a draft plan — guarded by a native confirm naming the patient.
export default function DeleteDraftButton({ planId, patientName }: { planId: number; patientName: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    const ok = window.confirm(`Delete this draft plan for ${patientName}? This can’t be undone.`);
    if (!ok) return;
    start(async () => { await deletePlanAction(planId); });
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
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
