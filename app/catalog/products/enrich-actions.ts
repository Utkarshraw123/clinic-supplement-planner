"use server";
import { requireUser } from "@/lib/auth/current-user";
import { suggestTermsFromUrl, enrichProductFromUrl, type ProductEnrichment } from "@/lib/enrich";

export async function suggestFromUrlAction(url: string): Promise<{ ok: true; terms: { id: number; label: string; type: string }[] } | { ok: false; error: string }> {
  await requireUser();
  try {
    const terms = await suggestTermsFromUrl(url);
    return { ok: true, terms };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that page" };
  }
}

// Full form pre-fill from a supplier/product page — name, size, form and tags (incl. allergens).
export async function enrichProductAction(url: string): Promise<{ ok: true; data: ProductEnrichment } | { ok: false; error: string }> {
  await requireUser();
  try {
    if (!/^https?:\/\//i.test(url.trim())) return { ok: false, error: "Enter a full URL starting with http(s)://" };
    const data = await enrichProductFromUrl(url.trim());
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that page" };
  }
}
