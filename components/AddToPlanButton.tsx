"use client";
import { useTransition } from "react";
import { addItemAction } from "@/app/plan/actions";
import { toast } from "@/components/Toaster";

// Adds a product to the prescription with instant feedback: the button shows
// "Adding…" while the server action runs, then a bottom toast confirms.
export default function AddToPlanButton({
  planId, patientId, productId, label = "Add", className = "btn--sm", toastMessage = "Added to prescription",
}: {
  planId: number; patientId: number; productId: number; label?: string; className?: string; toastMessage?: string;
}) {
  const [pending, start] = useTransition();
  function onClick() {
    const fd = new FormData();
    fd.set("planId", String(planId));
    fd.set("patientId", String(patientId));
    fd.set("productId", String(productId));
    start(async () => {
      await addItemAction(fd);
      toast(toastMessage);
    });
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : label}
    </button>
  );
}
