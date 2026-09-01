"use client";
import { useTransition } from "react";
import { removeProductAction } from "@/app/catalog/products/actions";

// Removes a product from the catalogue (soft delete via archive) — guarded by a
// native confirm naming the product. Reversible: the row is kept, just hidden
// from the catalogue and plan builder; past plans and sent PDFs are unaffected.
export default function RemoveProductButton({ productId, productName }: { productId: number; productName: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    const ok = window.confirm(
      `Remove "${productName}" from the catalogue?\n\n` +
      `It will no longer appear in the catalogue or when building plans. ` +
      `Plans already sent are unaffected.`
    );
    if (!ok) return;
    start(async () => { await removeProductAction(productId); });
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
      {pending ? "Removing…" : "Remove from catalogue"}
    </button>
  );
}
