"use server";
import { requireUser } from "@/lib/auth/current-user";
import { suggestTermsFromUrl } from "@/lib/enrich";

export async function suggestFromUrlAction(url: string): Promise<{ ok: true; terms: { id: number; label: string; type: string }[] } | { ok: false; error: string }> {
  await requireUser();
  try {
    const terms = await suggestTermsFromUrl(url);
    return { ok: true, terms };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that page" };
  }
}
