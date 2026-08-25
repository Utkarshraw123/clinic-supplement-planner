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

// Broader match across every taxonomy type — used to autopopulate the product form.
// Allergens/ingredients still drive safety flags; concern/diet/caution help pre-fill.
export function extractAllKnownTerms(text: string, terms: { id: number; label: string; type: string }[]): { id: number; label: string; type: string }[] {
  const hay = text.toLowerCase();
  const seen = new Set<number>();
  const out: { id: number; label: string; type: string }[] = [];
  for (const t of terms) {
    if (seen.has(t.id)) continue;
    const label = t.label.toLowerCase().trim();
    if (!label) continue;
    const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "i");
    if (re.test(hay)) { out.push(t); seen.add(t.id); }
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

// Pull a product name from OpenGraph/twitter title or <title>, trimming a trailing
// " | Brand" / " - Brand" site-name suffix that most shops append.
export function extractProductName(html: string): string | undefined {
  const meta = (prop: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    return (html.match(re)?.[1] ?? html.match(alt)?.[1]);
  };
  let raw = meta("og:title") || meta("twitter:title");
  if (!raw) raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return undefined;
  let name = decodeEntities(raw);
  name = name.split(/\s+[|–—-]\s+/)[0].trim();
  return name || undefined;
}

const SIZE_RE = /(\d+)\s?(capsules?|caps|tablets?|tabs|softgels?|gummies|sachets?|servings?|ml|g|mg|drops)\b/i;
export function extractPackageSize(text: string): string | undefined {
  const m = text.match(SIZE_RE);
  if (!m) return undefined;
  const unit = /^caps?$/i.test(m[2]) ? "capsules" : /^tabs?$/i.test(m[2]) ? "tablets" : m[2].toLowerCase();
  return `${m[1]} ${unit}`;
}

const FORMS: [RegExp, string][] = [
  [/\bsoftgels?\b/i, "softgel"], [/\bcapsules?\b|\bcaps\b/i, "capsule"],
  [/\btablets?\b|\btabs\b/i, "tablet"], [/\bpowder\b/i, "powder"],
  [/\bgummies\b|\bgummy\b/i, "gummy"], [/\bliquid\b|\bdrops\b|\btincture\b|\bml\b/i, "liquid"],
  [/\bspray\b/i, "spray"], [/\bsachets?\b/i, "sachet"],
];
export function extractForm(text: string): string | undefined {
  for (const [re, form] of FORMS) if (re.test(text)) return form;
  return undefined;
}

export type ProductEnrichment = {
  name?: string; packageSize?: string; form?: string;
  terms: { id: number; label: string; type: string }[];
};

// Pure parser: given raw HTML + the taxonomy, derive everything the form can pre-fill.
export function parseProductHtml(html: string, terms: { id: number; label: string; type: string }[]): ProductEnrichment {
  const name = extractProductName(html);
  const text = htmlToText(html);
  return {
    name,
    packageSize: extractPackageSize(text),
    form: extractForm(text),
    terms: extractAllKnownTerms(text, terms),
  };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SupplementDB-EnrichmentAssist/1.0 (+clinic internal tool)" },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPageText(url: string): Promise<string> {
  return htmlToText(await fetchPageHtml(url));
}

export async function suggestTermsFromUrl(url: string): Promise<{ id: number; label: string; type: string }[]> {
  const text = await fetchPageText(url);
  const terms = (await listTerms()).map((t) => ({ id: t.id, label: t.label, type: t.type as string }));
  return extractKnownTerms(text, terms);
}

// Fetch a supplier/product page and derive a full form pre-fill, including allergens.
export async function enrichProductFromUrl(url: string): Promise<ProductEnrichment> {
  const html = await fetchPageHtml(url);
  const terms = (await listTerms()).map((t) => ({ id: t.id, label: t.label, type: t.type as string }));
  return parseProductHtml(html, terms);
}
