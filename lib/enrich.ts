import { listTerms } from "@/lib/taxonomies";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractKnownTerms(text: string, terms: { id: number; label: string; type: string }[]): { id: number; label: string; type: string }[] {
  const hay = text.toLowerCase();
  const seen = new Set<number>();
  const out: { id: number; label: string; type: string }[] = [];
  for (const t of terms) {
    if (t.type !== "ingredient" && t.type !== "allergen") continue;
    if (seen.has(t.id)) continue;
    const label = t.label.toLowerCase().trim();
    if (!label) continue;
    const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "i");
    if (re.test(hay)) { out.push(t); seen.add(t.id); }
  }
  return out;
}

export async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SupplementDB-EnrichmentAssist/1.0 (+clinic internal tool)" },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const html = await res.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestTermsFromUrl(url: string): Promise<{ id: number; label: string; type: string }[]> {
  const text = await fetchPageText(url);
  const terms = (await listTerms()).map((t) => ({ id: t.id, label: t.label, type: t.type as string }));
  return extractKnownTerms(text, terms);
}
