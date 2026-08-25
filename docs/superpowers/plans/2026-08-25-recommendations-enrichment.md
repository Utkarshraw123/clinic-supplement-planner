# Supplement Selection Database — Plan 3: Recommendations + Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the app's functionality — a deterministic two-stage recommendation engine that suggests a safe, ranked shortlist for a patient, surfaced in the plan builder; and a paste-a-URL enrichment assist that suggests known ingredient/allergen terms from a product page for the practitioner to confirm.

**Architecture:** Two pure modules on top of the Plan 1/2 foundation. `lib/recommend.ts` reuses `flagProductForPatient`/`hasBlock`/`scoreProductForPatient`: stage 1 filters out any product that hard-blocks or violates a hard diet; stage 2 ranks survivors by goal-match score with human-readable reasons. `lib/enrich.ts` splits a pure `extractKnownTerms(text, terms)` scanner (deterministic substring match against the controlled taxonomy — no LLM, practitioner confirms) from a thin `fetchPageText(url)` wrapper. Both surface through server actions into existing screens.

**Tech Stack:** Next.js 14, TypeScript, `@libsql/client`, Vitest. No new dependencies.

## Global Constraints

- Extends Plans 1 & 2. Reuse `lib/flagging.ts`, `lib/products.ts`, `lib/patients.ts`, `lib/taxonomies.ts`, `lib/plans.ts`, `requireUser`. No restructuring.
- Deterministic only — no LLM. Suggestions are transparent (carry reasons); enrichment only *suggests* known taxonomy terms, the practitioner confirms before saving.
- Safety is a gate: a suggestion list must never contain a product that hard-blocks for the patient.
- Enrichment never auto-writes tags. It returns candidate term ids; saving reuses the existing `saveTagsAction` path.
- Raw parameterised SQL, async db fns. Tests: Vitest, TDD, serial `file:test.db`.
- Copy: sentence case, no exclamation marks. UI polish is explicitly out of scope (Plan 4).
- Dev server: preview name `supplement-db-dev` (port 3200). CLI scripts via `tsx` (do not exercise PDF under tsx).

---

### Task 1: Two-stage recommendation engine

**Files:**
- Create: `lib/recommend.ts`
- Test: `test/recommend.test.ts`

**Interfaces:**
- Consumes: `ProductDetail` (`lib/products.ts`), `PatientAttr` (`lib/patients.ts`), `flagProductForPatient`, `hasBlock`, `scoreProductForPatient` (`lib/flagging.ts`).
- Produces:
  - `type Suggestion = { product: ProductDetail; score: number; reasons: string[] }`
  - `suggestForPatient(products: ProductDetail[], attributes: PatientAttr[], limit?: number): Suggestion[]`
    - Stage 1 (filter): drop any product where `hasBlock(flagProductForPatient(p, attrs))` is true, OR that has a warn flag whose reason starts with `"not tagged "` (hard diet violation). Unsafe/diet-violating products never appear.
    - Stage 2 (rank): sort survivors by `scoreProductForPatient` descending, then by name ascending for stability. Keep only products with `score > 0` (a positive reason to suggest). Apply `limit` (default 10).
    - `reasons`: for each kept product, one `"targets {goal}"` per matched goal label (the concern tags overlapping patient goals), plus `"allergy-safe"`. If the patient has a diet preference and the product declares that diet, add `"{diet}-friendly"`.

- [ ] **Step 1: Write the failing test**

`test/recommend.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { suggestForPatient } from "@/lib/recommend";
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

function product(id: number, name: string, tags: ProductDetail["tags"]): ProductDetail {
  return { id, brand_id: 1, brand_name: "B", name, package_size: null, form: null, status: "active", tags, suppliers: [], alternatives: [] };
}

describe("recommendations", () => {
  const attrs: PatientAttr[] = [
    { termId: 1, label: "mushroom", attrType: "allergy" },
    { termId: 2, label: "energy", attrType: "goal" },
    { termId: 3, label: "vegan", attrType: "diet" },
  ];

  it("excludes allergen-conflicting products entirely", () => {
    const products = [
      product(10, "Mushroom Complex", [{ termId: 1, label: "mushroom", tagType: "allergen" }, { termId: 2, label: "energy", tagType: "concern" }]),
      product(11, "Iron", [{ termId: 2, label: "energy", tagType: "concern" }]),
    ];
    const out = suggestForPatient(products, attrs);
    expect(out.map((s) => s.product.id)).not.toContain(10);
    expect(out.map((s) => s.product.id)).toContain(11);
  });

  it("excludes hard diet violations (declared non-vegan)", () => {
    const products = [
      product(12, "Fish Oil", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 4, label: "vegetarian", tagType: "diet" }]),
      product(13, "Algae Oil", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 5, label: "vegan", tagType: "diet" }]),
    ];
    const out = suggestForPatient(products, attrs);
    expect(out.map((s) => s.product.id)).not.toContain(12);
    expect(out.map((s) => s.product.id)).toContain(13);
  });

  it("ranks by goal-match score and only keeps positive matches, with reasons", () => {
    const products = [
      product(14, "Two Match", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 6, label: "sleep", tagType: "concern" }]),
      product(15, "One Match", [{ termId: 2, label: "energy", tagType: "concern" }]),
      product(16, "No Match", [{ termId: 7, label: "immunity", tagType: "concern" }]),
    ];
    const goalsOnly: PatientAttr[] = [
      { termId: 2, label: "energy", attrType: "goal" },
      { termId: 6, label: "sleep", attrType: "goal" },
    ];
    const out = suggestForPatient(products, goalsOnly);
    expect(out.map((s) => s.product.id)).toEqual([14, 15]);
    expect(out[0].reasons).toContain("targets energy");
    expect(out[0].reasons).toContain("targets sleep");
    expect(out[0].reasons).toContain("allergy-safe");
  });

  it("adds a diet-friendly reason when the product declares the patient's diet", () => {
    const products = [product(17, "Vegan D", [{ termId: 2, label: "energy", tagType: "concern" }, { termId: 5, label: "vegan", tagType: "diet" }])];
    const out = suggestForPatient(products, attrs);
    expect(out[0].reasons).toContain("vegan-friendly");
  });

  it("respects the limit", () => {
    const products = Array.from({ length: 5 }, (_, i) => product(20 + i, `P${i}`, [{ termId: 2, label: "energy", tagType: "concern" }]));
    const out = suggestForPatient(products, [{ termId: 2, label: "energy", attrType: "goal" }], 3);
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/recommend.test.ts`
Expected: FAIL ("suggestForPatient is not a function").

- [ ] **Step 3: Write `lib/recommend.ts`**

```ts
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";
import { flagProductForPatient, hasBlock, scoreProductForPatient } from "@/lib/flagging";

export type Suggestion = { product: ProductDetail; score: number; reasons: string[] };

const norm = (s: string) => s.trim().toLowerCase();

export function suggestForPatient(products: ProductDetail[], attributes: PatientAttr[], limit = 10): Suggestion[] {
  const goalLabels = attributes.filter((a) => a.attrType === "goal").map((a) => norm(a.label));
  const dietLabels = attributes.filter((a) => a.attrType === "diet").map((a) => norm(a.label));

  const suggestions: Suggestion[] = [];
  for (const product of products) {
    const flags = flagProductForPatient(product, attributes);
    // Stage 1: exclude hard blocks and hard diet violations.
    if (hasBlock(flags)) continue;
    if (flags.some((f) => f.level === "warn" && f.reason.startsWith("not tagged "))) continue;

    // Stage 2: score by goal overlap; only keep positive matches.
    const score = scoreProductForPatient(product, attributes);
    if (score <= 0) continue;

    const productConcerns = product.tags.filter((t) => t.tagType === "concern").map((t) => norm(t.label));
    const productDiets = product.tags.filter((t) => t.tagType === "diet").map((t) => norm(t.label));
    const reasons: string[] = [];
    for (const goal of goalLabels) {
      if (productConcerns.includes(goal)) reasons.push(`targets ${goal}`);
    }
    reasons.push("allergy-safe");
    for (const diet of dietLabels) {
      if (productDiets.includes(diet)) reasons.push(`${diet}-friendly`);
    }
    suggestions.push({ product, score, reasons });
  }

  suggestions.sort((a, b) => (b.score - a.score) || a.product.name.localeCompare(b.product.name));
  return suggestions.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/recommend.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recommend.ts test/recommend.test.ts && git commit -m "feat: add two-stage recommendation engine"
```

---

### Task 2: Suggestions in the plan builder

**Files:**
- Modify: `app/plan/[patientId]/page.tsx` (add a suggestions section)
- Test: `test/recommend-integration.test.ts`

**Interfaces:**
- Consumes: `suggestForPatient` (`lib/recommend.ts`), `getProduct` (`lib/products.ts`), existing `searchProducts`, `addItemAction`.
- Produces: a "Suggested for {patient}" section listing ranked safe products with reasons and an Add button (reuses `addItemAction`). Products already in the plan are excluded from suggestions.

- [ ] **Step 1: Write the failing integration test (end-to-end suggestion from DB)**

`test/recommend-integration.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags, getProduct } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { suggestForPatient } from "@/lib/recommend";

describe("recommendation integration", () => {
  it("suggests a safe, goal-matching product and hides the allergen one", async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `Rec ${Date.now()}` });
    const energy = await addTerm("concern", "energy");
    const mushroom = await addTerm("allergen", "mushroom");

    const safeId = await createProduct({ brandId, name: "Safe Energy", form: "capsule" });
    await setProductTags(safeId, [{ termId: energy, tagType: "concern" }]);
    const unsafeId = await createProduct({ brandId, name: "Mushroom Energy", form: "capsule" });
    await setProductTags(unsafeId, [{ termId: energy, tagType: "concern" }, { termId: mushroom, tagType: "allergen" }]);

    const patientId = await createPatient({ name: "Rec P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }, { termId: energy, attrType: "goal" }]);

    const patient = await getPatient(patientId);
    const products = [await getProduct(safeId), await getProduct(unsafeId)].filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProduct>>>[];
    const out = suggestForPatient(products, patient!.attributes);

    expect(out.map((s) => s.product.id)).toContain(safeId);
    expect(out.map((s) => s.product.id)).not.toContain(unsafeId);
    expect(out[0].reasons).toContain("targets energy");
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run test/recommend-integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the suggestions section to `app/plan/[patientId]/page.tsx`**

Add this import near the other `lib` imports:
```tsx
import { suggestForPatient } from "@/lib/recommend";
import { getProduct } from "@/lib/products";
```

After the line that builds `catalog` (`const catalog = await searchProducts("");`), add:
```tsx
  const inPlan = new Set(plan!.items.map((it) => it.product.id));
  const fullCatalog = (await Promise.all(catalog.map((c) => getProduct(c.id)))).filter((p): p is NonNullable<typeof p> => !!p && !inPlan.has(p.id));
  const suggestions = suggestForPatient(fullCatalog, patient.attributes, 5);
```

Then, immediately before the `<section style={{ marginTop: 8 }}>` "Add a product" section, insert:
```tsx
      {suggestions.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h2 style={{ fontWeight: 500, fontSize: 16 }}>Suggested for {patient.name}</h2>
          <p style={{ fontSize: 12, color: "#5F5E5A" }}>Allergy-safe, ranked by this patient&apos;s goals.</p>
          <ul>
            {suggestions.map((s) => (
              <li key={s.product.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                <span>
                  {s.product.name} · {s.product.brand_name}
                  <span style={{ fontSize: 12, color: "#0F6E56" }}> — {s.reasons.join(" · ")}</span>
                </span>
                <form action={addItemAction}>
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="productId" value={s.product.id} />
                  <button type="submit">Add</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 4: Run tests + browser-verify**

Run: `npx vitest run` → all PASS. Then run the dev server, seed (`scripts/seed-clinical-demo.ts` gives Emma with a mushroom allergy + sleep goal), open `/plan/1`, and confirm the "Suggested for Emma Hartley" section lists only allergy-safe products with reasons, and Add works.

- [ ] **Step 5: Commit**

```bash
git add "app/plan/[patientId]/page.tsx" test/recommend-integration.test.ts && git commit -m "feat: surface allergy-safe ranked suggestions in the plan builder"
```

---

### Task 3: Paste-a-URL enrichment assist

**Files:**
- Create: `lib/enrich.ts`, `app/catalog/products/enrich-actions.ts`, `components/EnrichAssist.tsx`
- Modify: `app/catalog/products/[id]/page.tsx` (mount the assist)
- Test: `test/enrich.test.ts`

**Interfaces:**
- Consumes: `listTerms` (`lib/taxonomies.ts`), `getProduct`, `setProductTags` (`lib/products.ts`), `requireUser`.
- Produces:
  - `extractKnownTerms(text: string, terms: { id: number; label: string; type: string }[]): { id: number; label: string; type: string }[]` — pure: returns the taxonomy terms whose label appears (case-insensitive, word-boundary) in `text`, deduped. Only `ingredient` and `allergen` types are scanned.
  - `fetchPageText(url: string): Promise<string>` — fetches the URL with an identified User-Agent and an 8s timeout, strips tags to text. Throws on non-OK/timeouts.
  - `suggestTermsFromUrl(url: string): Promise<{ id: number; label: string; type: string }[]>` — `fetchPageText` then `extractKnownTerms` against ingredient/allergen taxonomy.
  - Server action `suggestFromUrlAction(formData)` returns the suggested terms as JSON for the client component; the practitioner ticks which to keep, and saving reuses the product editor's `saveTagsAction` (no direct auto-write).

- [ ] **Step 1: Write the failing test (pure extractor — the safety-relevant part)**

`test/enrich.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractKnownTerms } from "@/lib/enrich";

const terms = [
  { id: 1, label: "mushroom", type: "allergen" },
  { id: 2, label: "magnesium", type: "ingredient" },
  { id: 3, label: "vitamin d", type: "ingredient" },
  { id: 4, label: "soy", type: "allergen" },
  { id: 5, label: "energy", type: "concern" },
];

describe("extractKnownTerms", () => {
  it("finds ingredient and allergen terms present in the text, case-insensitively", () => {
    const text = "Contains Magnesium and Vitamin D. Suitable for those avoiding Soy.";
    const found = extractKnownTerms(text, terms).map((t) => t.label).sort();
    expect(found).toEqual(["magnesium", "soy", "vitamin d"]);
  });

  it("never scans non ingredient/allergen types", () => {
    const text = "Great for energy and vitality.";
    expect(extractKnownTerms(text, terms).map((t) => t.label)).not.toContain("energy");
  });

  it("matches on word boundaries, not substrings", () => {
    const text = "This soybean-free formula lists no allergens.";
    // 'soy' should NOT match inside 'soybean'
    expect(extractKnownTerms(text, terms).map((t) => t.label)).not.toContain("soy");
  });

  it("dedupes repeated mentions", () => {
    const text = "Magnesium, magnesium, MAGNESIUM.";
    expect(extractKnownTerms(text, terms).filter((t) => t.label === "magnesium")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/enrich.test.ts`
Expected: FAIL ("extractKnownTerms is not a function").

- [ ] **Step 3: Write `lib/enrich.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/enrich.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the server action `app/catalog/products/enrich-actions.ts`**

```ts
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
```

- [ ] **Step 6: Write `components/EnrichAssist.tsx`**

```tsx
"use client";
import { useState } from "react";
import { suggestFromUrlAction } from "@/app/catalog/products/enrich-actions";

export default function EnrichAssist() {
  const [url, setUrl] = useState("");
  const [terms, setTerms] = useState<{ id: number; label: string; type: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setError(""); setTerms([]); setLoading(true);
    const res = await suggestFromUrlAction(url);
    setLoading(false);
    if (res.ok) { setTerms(res.terms); if (res.terms.length === 0) setError("No known ingredient or allergen terms found on that page."); }
    else setError(res.error);
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a product page URL to scan" style={{ flex: 1 }} />
        <button type="button" onClick={run} disabled={loading || !url}>{loading ? "Scanning…" : "Scan"}</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#A32D2D" }}>{error}</p>}
      {terms.length > 0 && (
        <p style={{ fontSize: 13 }}>
          Found: {terms.map((t) => `${t.label} (${t.type})`).join(", ")}.
          <span style={{ color: "#5F5E5A" }}> Confirm by selecting them in the tag lists above, then Save tags.</span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Mount the assist in the product editor**

In `app/catalog/products/[id]/page.tsx`, add the import:
```tsx
import EnrichAssist from "@/components/EnrichAssist";
```
Inside the "Tags" `<section>`, immediately after the `<h2 ...>Tags</h2>` line, insert:
```tsx
        <EnrichAssist />
```

- [ ] **Step 8: Run full suite + browser-verify**

Run: `npx vitest run` → all PASS.
Then run the dev server, open a product editor, paste a brand product URL, click Scan, and confirm known ingredient/allergen terms are surfaced (the practitioner then ticks them in the tag lists and saves — the assist never auto-writes).

- [ ] **Step 9: Commit**

```bash
git add lib/enrich.ts app/catalog/products/enrich-actions.ts components/EnrichAssist.tsx "app/catalog/products/[id]/page.tsx" test/enrich.test.ts && git commit -m "feat: add paste-a-URL enrichment assist (suggest-and-confirm)"
```

---

## Self-Review

**1. Spec coverage (Plan 3 slice):**
- Two-stage recommendation engine (filter unsafe → rank by goals, explainable) → Task 1. ✓
- Suggestions surfaced where plans are built → Task 2. ✓
- Suggestions never include allergen conflicts or hard diet violations → Task 1 (stage-1 filter) + Task 2 integration test. ✓
- Web-enrichment assist that helps fill ingredient/allergen data without auto-trusting → Task 3 (suggest-and-confirm; practitioner saves via existing tag path). ✓
- Deferred to Plan 4 (correct): full UI polish pass (UI UX Pro Max skill + 21st.dev) across all screens.

**2. Placeholder scan:** No "TBD/handle errors" — real code + exact commands throughout. Enrichment errors handled explicitly (`suggestFromUrlAction` returns `{ok:false,error}`). ✓

**3. Type consistency:** `Suggestion`/`suggestForPatient` (Task 1) consumed by Task 2. `extractKnownTerms`/`fetchPageText`/`suggestTermsFromUrl` (Task 3) consumed by the action + component. Reuses `ProductDetail`, `PatientAttr`, `flagProductForPatient`, `scoreProductForPatient` with their existing signatures. `getProduct` returns `ProductDetail | null` — Task 2 filters nulls before passing to `suggestForPatient`. ✓

**Note for executor:** No new dependencies. `fetchPageText` makes a real outbound request — only exercised via the browser step, not in unit tests (tests cover the pure `extractKnownTerms`). The engine is pure and fully unit-tested; safety (no blocked product in suggestions) is covered by Task 1 + the Task 2 integration test.
