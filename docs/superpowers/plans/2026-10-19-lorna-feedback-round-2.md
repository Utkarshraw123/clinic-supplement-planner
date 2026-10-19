# Lorna Feedback Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Lorna's second feedback round: "See notes below" duration, formatted consultation date, duplicate and protocols that carry both pages, editable dosing presets, per-brand discount codes, reusable dietary protocols, and a Word download alongside the PDF.

**Architecture:** Next.js 14 App Router app on libSQL/Turso. Data lives in `lib/*.ts` modules (plain SQL through `query`/`execute` from `lib/db.ts`), server actions in `app/**/actions.ts`, pages are server components, and interactive bits are small `"use client"` components. Pure helpers that client components need (`lib/format.ts`, `lib/text-merge.ts`, `lib/order-codes.ts`) have no imports, so they never pull the database into the browser bundle. Work ships in four workstreams (A → D), each deployed and verified before the next.

**Tech Stack:** Next.js 14, React 18, TypeScript 5, @libsql/client, @react-pdf/renderer 4, vitest 4, `docx` 9.7.2 (new), `jszip` 3.10.1 (new, dev only).

**Spec:** `docs/superpowers/specs/2026-10-19-lorna-feedback-round-2-design.md`

## Global Constraints

- Work in `/Users/utkarshrawat/Wild Dash/supplement-selection-db` on `main`.
- Run one test file: `npx vitest run test/<file>.test.ts`. Full suite: `npx vitest run`. Typecheck: `npx tsc --noEmit` (no output = pass). Tests use `file:test.db` (set in `test/setup.ts`).
- Schema changes are additive only: `CREATE TABLE IF NOT EXISTS` appended to `lib/schema.sql`, or `ensureColumn(...)` in `scripts/migrate.ts`. Migrations run automatically at build (`tsx scripts/migrate.ts && next build`).
- `lib/schema.sql` is split on `;` — never put a semicolon inside a comment there.
- The consultation date prints as "26 August 2026" and the PDF/Word never show a time.
- Files imported by `"use client"` components must not import `@/lib/db` or anything that does.
- Admin-only pages call `requireAdmin()`; other pages call `requireUser()`. Sidebar links live in `components/AppShell.tsx` (icons available: home, users, grid, layers, chart, note, tag, team, cog).
- Pin new packages exactly: `docx@9.7.2`, `jszip@3.10.1`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pushing `main` deploys to the live clinic app. Before each `git push`, get the user's explicit go-ahead.
- Live app: `https://clinic-supplement-planner.vercel.app`, demo login `lorna123` / `lorna123`. Check deploy status with `npx --yes vercel ls clinic-supplement-planner 2>&1 | sed -n '6,7p'` (wait for `● Ready`).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/format.ts` | create | `formatDuration`, `formatConsultationDate` (pure) |
| `lib/text-merge.ts` | create | `mergeSection` — fill-or-append text rule (pure) |
| `lib/order-codes.ts` | create | Order-code dropdown ↔ stored value mapping + print resolution (pure) |
| `lib/dosing.ts` | create | Dosing preset CRUD (archive = delete) |
| `lib/brand-codes.ts` | create | Per-brand discount code CRUD + default |
| `lib/dietary-protocols.ts` | create | Dietary protocol template CRUD |
| `lib/docx.ts` | create | `renderPlanDocx` — Word version of the guide |
| `lib/durations.ts` | modify | add "See notes below" |
| `lib/guide.ts` | modify | supplement rows use `formatDuration` + `resolveOrderCode` |
| `lib/pdf.tsx` | modify | consultation date via `formatConsultationDate` |
| `lib/plans.ts` | modify | duplicate copies guide; `setItemOrderCodeStored` |
| `lib/protocols.ts` | modify | protocols carry item extras + 4 page-2 sections; merge on apply |
| `lib/products.ts` | modify | brand default code comes from `brand_codes` |
| `lib/brands.ts` | modify | drop the old single promo code |
| `lib/delivery.ts` | modify | snapshot stores letterhead; `getSnapshotFrozen` |
| `lib/schema.sql` | modify | `brand_codes`, `dietary_protocols` tables |
| `scripts/migrate.ts` | modify | new columns + one-time promo-code move |
| `components/PlanItemFields.tsx` | modify | Order code dropdown |
| `components/SnippetTextarea.tsx` | modify | optional "insert a template" dropdown |
| `components/AppShell.tsx` | modify | sidebar links |
| `app/admin/dosing/{page.tsx,actions.ts}` | create | Dosing presets admin |
| `app/admin/dietary-protocols/{page.tsx,actions.ts}` | create | Dietary protocols admin |
| `app/api/snapshots/[id]/docx/route.ts` | create | Word download |
| `app/catalog/brands/{page.tsx,actions.ts}` | modify | manage codes per brand |
| `app/plan/actions.ts`, `app/plan/[patientId]/page.tsx` | modify | order-code dropdown wiring, active presets |
| `app/plan/[patientId]/prepare/page.tsx` | modify | date label, dietary protocol dropdown |
| `app/protocols/actions.ts`, `app/protocols/[id]/page.tsx` | modify | edit page-2 text, show item extras |
| `app/patients/[id]/history/page.tsx` | modify | "Download Word" button |

---

## Workstream A — quick fixes

### Task 1: "See notes below" duration and formatted consultation date

**Files:**
- Create: `lib/format.ts`, `test/format.test.ts`
- Modify: `lib/durations.ts`, `lib/guide.ts:35-54`, `lib/pdf.tsx` (imports + the "Date of consultation" meta row), `app/plan/[patientId]/prepare/page.tsx` (date label), `test/guide.test.ts`

**Interfaces:**
- Produces: `formatDuration(d: string | null | undefined): string`, `formatConsultationDate(v: string | null | undefined): string` from `@/lib/format` (used again in Task 9).

- [ ] **Step 1: Write the failing tests**

Create `test/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatDuration, formatConsultationDate } from "@/lib/format";
import { DURATION_OPTIONS } from "@/lib/durations";

describe("formatDuration", () => {
  it("prefixes lengths of time with 'for'", () => {
    expect(formatDuration("3 months")).toBe("for 3 months");
    expect(formatDuration(" 1 week ")).toBe("for 1 week");
  });
  it("prints non-time options verbatim", () => {
    expect(formatDuration("Finish off, no repeat")).toBe("Finish off, no repeat");
    expect(formatDuration("See notes below")).toBe("See notes below");
  });
  it("returns empty for blank/null", () => {
    expect(formatDuration("")).toBe("");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
  });
  it("offers 'See notes below' in the Duration dropdown", () => {
    expect(DURATION_OPTIONS).toContain("See notes below");
  });
});

describe("formatConsultationDate", () => {
  it("formats ISO dates as '26 August 2026'", () => {
    expect(formatConsultationDate("2026-08-26")).toBe("26 August 2026");
    expect(formatConsultationDate("2026-01-05")).toBe("5 January 2026");
  });
  it("returns non-ISO text unchanged and never adds a time", () => {
    expect(formatConsultationDate("3 September 2026")).toBe("3 September 2026");
    expect(formatConsultationDate("2026-13-40")).toBe("2026-13-40");
  });
  it("returns empty for blank/null", () => {
    expect(formatConsultationDate("")).toBe("");
    expect(formatConsultationDate(null)).toBe("");
  });
});
```

Append to `test/guide.test.ts`, inside the top-level `describe` (before its closing `});`):

```ts
  it("supplement row prints 'See notes below' verbatim (not 'for See notes below')", async () => {
    const brandId = await createBrand({ name: `SeeNotes ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "SeeNotes Mag", form: "capsule" });
    const planId = await getOrCreateDraftPlan(await createPatient({ name: "SeeNotes P", dob: "1990-01-01" }));
    const itemId = await addPlanItem(planId, pid);
    await setItemDuration(itemId, "See notes below");
    const [row] = buildSupplementRows((await getPlan(planId))!);
    expect(row.duration).toBe("See notes below");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/format.test.ts test/guide.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/format"`, and the guide test fails with `expected 'for See notes below' to be 'See notes below'`.

- [ ] **Step 3: Implement**

Create `lib/format.ts`:

```ts
// Pure text formatting shared by the PDF, the Word export and the Prepare preview.
// Dependency-free so client components can import it too.

// Course lengths print as "for 3 months"; options that aren't a length of time
// ("Finish off, no repeat", "See notes below") print exactly as chosen.
const VERBATIM_DURATIONS = [/^finish off/i, /^see notes/i];

export function formatDuration(d: string | null | undefined): string {
  const v = (d ?? "").trim();
  if (!v) return "";
  return VERBATIM_DURATIONS.some((re) => re.test(v)) ? v : `for ${v}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// The consultation date as it prints on the plan: "26 August 2026" — never a time.
// ISO dates (YYYY-MM-DD) are reformatted; anything else is returned unchanged.
export function formatConsultationDate(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return s;
  return `${Number(m[3])} ${month} ${m[1]}`;
}
```

In `lib/durations.ts`, change the `DURATION_OPTIONS` array to:

```ts
export const DURATION_OPTIONS = [
  "1 week", "2 weeks", "3 weeks", "4 weeks", "1 month", "3 months", "6 months", "Finish off, no repeat", "See notes below",
] as const;
```

In `lib/guide.ts`, add to the imports at the top:

```ts
import { formatDuration } from "@/lib/format";
```

and in `buildSupplementRows`, replace these two lines:

```ts
    const dur = it.duration?.trim() || "";
    const durText = dur ? (/^finish off/i.test(dur) ? dur : `for ${dur}`) : "";
```

with:

```ts
    const durText = formatDuration(it.duration);
```

In `lib/pdf.tsx`, add to the imports:

```ts
import { formatConsultationDate } from "@/lib/format";
```

and change the date meta row from `<Text style={s.metaValue}>{data.consultationDate}</Text>` to:

```tsx
<Text style={s.metaValue}>{formatConsultationDate(data.consultationDate)}</Text>
```

In `app/plan/[patientId]/prepare/page.tsx`, change `<span>Date of consultation</span>` to:

```tsx
<span>Date of consultation <span className="muted-xs">(shown on the plan)</span></span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/format.test.ts test/guide.test.ts test/pdf.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all test files pass.

- [ ] **Step 6: Commit**

```bash
git add lib/format.ts lib/durations.ts lib/guide.ts lib/pdf.tsx "app/plan/[patientId]/prepare/page.tsx" test/format.test.ts test/guide.test.ts
git commit -F - <<'EOF'
Plans: "See notes below" duration and a readable consultation date

Adds "See notes below" to the Duration dropdown (prints verbatim, not "for …"),
and prints the consultation date as "26 August 2026" instead of the ISO date. The
Prepare field now says it's the date shown on the plan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Deploy Workstream A and verify on the live app**

Ask the user for the go-ahead, then: `git push origin main`. Wait for `● Ready`.
Verify in the browser pane (logged in as lorna123):
1. Open any patient's plan builder → an item's Duration dropdown lists "See notes below".
2. Open that patient's Prepare page → the date field reads "Date of consultation (shown on the plan)".
The printed date format is covered by `test/format.test.ts` and `test/pdf.test.ts`; it will show on the next plan Lorna finalises (no test plan needs to be finalised on prod). Report what was checked.

---

## Workstream B — plans and protocols carry everything

### Task 2: Duplicate copies page 2 (blank consultation date)

**Files:**
- Modify: `lib/plans.ts` (`duplicatePlan`, around lines 91-110)
- Test: `test/plans.test.ts`

**Interfaces:**
- Consumes: `savePlanGuide`, `getPlanGuide` from `@/lib/guide` (tests only).
- Produces: `duplicatePlan(sourcePlanId: number, authorId?: number): Promise<number>` — unchanged signature, now also copies `plan_guide`.

- [ ] **Step 1: Write the failing tests**

In `test/plans.test.ts`, add to the imports:

```ts
import { savePlanGuide, getPlanGuide } from "@/lib/guide";
```

Add inside the `describe("plans", …)` block:

```ts
  it("duplicate copies the guide (page 2) but leaves the consultation date blank", async () => {
    const patient = await createPatient({ name: "DupGuide P", dob: "1990-01-01" });
    const src = await Plans.getOrCreateDraftPlan(patient);
    await Plans.addPlanItem(src, productId);
    await savePlanGuide(src, {
      consultationDate: "2026-08-26", intro: "Hi Jane", nextConsultation: "Gut cleanse next",
      lifestyle: "Sleep 8h", dietary: "More greens", supplementText: null, medsText: "- Levothyroxine", notes: "Call me",
    });

    const dupId = await Plans.duplicatePlan(src);
    const g = await getPlanGuide(dupId);
    expect(g).not.toBeNull();
    expect(g!.consultationDate).toBeNull();
    expect(g).toMatchObject({
      intro: "Hi Jane", nextConsultation: "Gut cleanse next", lifestyle: "Sleep 8h",
      dietary: "More greens", medsText: "- Levothyroxine", notes: "Call me",
    });
    expect((await getPlanGuide(src))!.consultationDate).toBe("2026-08-26"); // source untouched
  });

  it("duplicate of a plan with no saved guide has no guide row", async () => {
    const src = await Plans.getOrCreateDraftPlan(await createPatient({ name: "NoGuide P", dob: "1990-01-01" }));
    await Plans.addPlanItem(src, productId);
    const dupId = await Plans.duplicatePlan(src);
    expect(await getPlanGuide(dupId)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/plans.test.ts`
Expected: FAIL — `expected null not to be null` on the first new test.

- [ ] **Step 3: Implement**

In `lib/plans.ts`, replace the comment above `duplicatePlan` with:

```ts
// Copy an existing plan into a brand-new draft for the SAME patient — every item field
// and the guide's page-2 text — so a follow-up starts from last time and only needs
// tweaking. The consultation date is left blank for the new consultation. Source untouched.
```

and inside `duplicatePlan`, immediately before `return newId;`, add:

```ts
  await execute(
    `INSERT INTO plan_guide (plan_id, consultation_date, intro, next_consultation, lifestyle, dietary, supplement_text, meds_text, notes, updated_at)
     SELECT ?, NULL, intro, next_consultation, lifestyle, dietary, supplement_text, meds_text, notes, datetime('now')
     FROM plan_guide WHERE plan_id = ?`,
    [newId, sourcePlanId]
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/plans.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plans.ts test/plans.test.ts
git commit -F - <<'EOF'
Plans: duplicate copies page 2 too, with a blank consultation date

Duplicating a plan now brings across the intro, recommendations, medications and
notes so a follow-up starts from last time's wording. The consultation date is left
blank for the new consult.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 3: Protocols store and apply both pages

**Files:**
- Create: `lib/text-merge.ts`, `test/text-merge.test.ts`
- Modify: `scripts/migrate.ts` (end of `runMigrations`), `lib/plans.ts` (new setter after `setItemOrderCode`), `lib/protocols.ts` (types, `savePlanAsProtocol`, `getProtocol`, `applyProtocolToPlan`, new `updateProtocolSections`)
- Test: `test/protocols.test.ts`

**Interfaces:**
- Produces:
  - `mergeSection(existing: string | null | undefined, incoming: string | null | undefined): string` from `@/lib/text-merge` (also used in Task 8).
  - `setItemOrderCodeStored(itemId: number, stored: string | null): Promise<void>` from `@/lib/plans` — stores `null`, `""` or a code exactly (used in Tasks 7 and later).
  - From `@/lib/protocols`: `type ProtocolSections = { nextConsultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null }`; `ProtocolItem` gains `note, duration, orderCode, size: string | null`; `ProtocolDetail = ProtocolSections & { id; name; description; items }`; `updateProtocolSections(id: number, s: ProtocolSections): Promise<void>` (used in Task 4).

- [ ] **Step 1: Write the failing tests**

Create `test/text-merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeSection } from "@/lib/text-merge";

describe("mergeSection", () => {
  it("fills an empty section", () => {
    expect(mergeSection("", "Eat greens")).toBe("Eat greens");
    expect(mergeSection(null, "x")).toBe("x");
  });
  it("keeps existing text when incoming is empty", () => {
    expect(mergeSection("Keep me", "")).toBe("Keep me");
    expect(mergeSection("Keep me", null)).toBe("Keep me");
  });
  it("appends below existing text with a blank line", () => {
    expect(mergeSection("First", "Second")).toBe("First\n\nSecond");
    expect(mergeSection("First\n", "  Second ")).toBe("First\n\nSecond");
  });
  it("returns empty when both are empty", () => {
    expect(mergeSection(null, undefined)).toBe("");
  });
});
```

In `test/protocols.test.ts`, replace the two import lines for `@/lib/plans` and `@/lib/protocols` with:

```ts
import { getOrCreateDraftPlan, addPlanItem, setItemDosing, getPlan, setItemNote, setItemDuration, setItemSize, setItemOrderCodeStored } from "@/lib/plans";
import { savePlanAsProtocol, listProtocols, getProtocol, applyProtocolToPlan, createProtocol, addProtocolItem, removeProtocolItem, setProtocolItemDosing, updateProtocolMeta, updateProtocolSections } from "@/lib/protocols";
import { savePlanGuide, getPlanGuide } from "@/lib/guide";
```

Add inside the `describe("protocols", …)` block:

```ts
  it("saves both pages: every item field and the four page-2 sections", async () => {
    const srcPlan = await getOrCreateDraftPlan(await createPatient({ name: "Full Src", dob: "1990-01-01" }));
    const i1 = await addPlanItem(srcPlan, productA);
    await setItemDosing(i1, null, "1 at night");
    await setItemNote(i1, "with food");
    await setItemDuration(i1, "3 months");
    await setItemSize(i1, "90 capsules");
    await setItemOrderCodeStored(i1, "WN10");
    await savePlanGuide(srcPlan, {
      consultationDate: "2026-08-26", intro: "Hi Jane", nextConsultation: "Gut cleanse next",
      lifestyle: "Sleep 8h", dietary: "More greens", supplementText: null, medsText: "- Levothyroxine", notes: "Call me",
    });

    const protocolId = await savePlanAsProtocol(srcPlan, "Full Protocol", null);
    const d = (await getProtocol(protocolId))!;
    expect(d.items[0]).toMatchObject({ note: "with food", duration: "3 months", size: "90 capsules", orderCode: "WN10", dosingText: "1 at night" });
    expect(d).toMatchObject({ nextConsultation: "Gut cleanse next", lifestyle: "Sleep 8h", dietary: "More greens", notes: "Call me" });
  });

  it("applying a full protocol copies item fields and merges page 2 (fill empty, append filled, never touch intro/meds/date)", async () => {
    const protocolId = await createProtocol("Merge Test", null);
    const it1 = await addProtocolItem(protocolId, productB);
    await execute("UPDATE protocol_items SET note = ?, duration = ?, size = ?, order_code = ? WHERE id = ?", ["at dinner", "1 month", "60 capsules", "", it1]);
    await updateProtocolSections(protocolId, { nextConsultation: null, lifestyle: "Walk daily", dietary: "Low sugar", notes: null });

    const target = await getOrCreateDraftPlan(await createPatient({ name: "Merge Target", dob: "1990-01-01" }));
    await savePlanGuide(target, {
      consultationDate: "2026-09-01", intro: "Hello Sam", nextConsultation: null,
      lifestyle: "Sleep 8h", dietary: null, supplementText: null, medsText: "- Metformin", notes: null,
    });
    await applyProtocolToPlan(protocolId, target);

    const plan = (await getPlan(target))!;
    const item = plan.items.find((i) => i.product.id === productB)!;
    expect(item).toMatchObject({ note: "at dinner", duration: "1 month", size: "60 capsules", orderCode: "" });
    const g = (await getPlanGuide(target))!;
    expect(g.lifestyle).toBe("Sleep 8h\n\nWalk daily"); // appended
    expect(g.dietary).toBe("Low sugar");                // filled
    expect(g.intro).toBe("Hello Sam");                  // untouched
    expect(g.medsText).toBe("- Metformin");             // untouched
    expect(g.consultationDate).toBe("2026-09-01");      // untouched
  });

  it("applying an old-style protocol (no page-2 text) creates no guide row", async () => {
    const protocolId = await createProtocol("Old Style", null);
    await addProtocolItem(protocolId, productA);
    const target = await getOrCreateDraftPlan(await createPatient({ name: "Old Target", dob: "1990-01-01" }));
    await applyProtocolToPlan(protocolId, target);
    expect(await getPlanGuide(target)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/text-merge.test.ts test/protocols.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/text-merge"`, and protocols tests fail on the missing `setItemOrderCodeStored` / `updateProtocolSections` exports.

- [ ] **Step 3: Implement the merge helper and the stored-code setter**

Create `lib/text-merge.ts`:

```ts
// Combine a section's existing text with incoming text without ever losing either:
// empty existing → incoming; empty incoming → existing; both → existing, a blank line,
// then incoming. Dependency-free so client components can use it too.
export function mergeSection(existing: string | null | undefined, incoming: string | null | undefined): string {
  const a = (existing ?? "").trim();
  const b = (incoming ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  return `${a}\n\n${b}`;
}
```

In `lib/plans.ts`, add directly after `setItemOrderCode`:

```ts
// Store an item's order code exactly as given: null = follow the brand's default code,
// "" = explicitly no code, otherwise the code itself (see lib/order-codes.ts).
export async function setItemOrderCodeStored(itemId: number, stored: string|null): Promise<void> {
  await execute("UPDATE plan_items SET order_code = ? WHERE id = ?", [stored === null ? null : stored.trim(), itemId]);
}
```

- [ ] **Step 4: Add the migrations**

In `scripts/migrate.ts`, add at the end of `runMigrations` (after the `letterhead_template` line):

```ts
  await ensureColumn("protocol_items", "note", "TEXT");          // full item fields, so a protocol is the whole plan
  await ensureColumn("protocol_items", "duration", "TEXT");
  await ensureColumn("protocol_items", "order_code", "TEXT");
  await ensureColumn("protocol_items", "size", "TEXT");
  await ensureColumn("protocols", "next_consultation", "TEXT");  // page-2 sections a protocol carries
  await ensureColumn("protocols", "lifestyle", "TEXT");
  await ensureColumn("protocols", "dietary", "TEXT");
  await ensureColumn("protocols", "notes", "TEXT");
```

- [ ] **Step 5: Implement the protocol changes**

In `lib/protocols.ts`, replace the first two import lines and the three type declarations with:

```ts
import { query, execute } from "@/lib/db";
import { addPlanItem, setItemDosing, setItemNote, setItemDuration, setItemSize, setItemOrderCodeStored, dosingTextFor } from "@/lib/plans";
import { getPlanGuide, savePlanGuide } from "@/lib/guide";
import { mergeSection } from "@/lib/text-merge";

export type ProtocolSummary = { id: number; name: string; description: string | null; itemCount: number };
export type ProtocolItem = {
  itemId: number; productId: number; productName: string; brandName: string;
  dosingPresetId: number | null; dosingCustomText: string | null; dosingText: string;
  note: string | null; duration: string | null; orderCode: string | null; size: string | null;
};
// Page-2 text a protocol carries. The personal intro, medications and consultation date
// are deliberately excluded — they belong to each patient.
export type ProtocolSections = {
  nextConsultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null;
};
export type ProtocolDetail = ProtocolSections & {
  id: number; name: string; description: string | null; items: ProtocolItem[];
};
```

Add after `setProtocolItemDosing`:

```ts
export async function updateProtocolSections(id: number, s: ProtocolSections): Promise<void> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  await execute(
    "UPDATE protocols SET next_consultation = ?, lifestyle = ?, dietary = ?, notes = ? WHERE id = ?",
    [clean(s.nextConsultation), clean(s.lifestyle), clean(s.dietary), clean(s.notes), id]
  );
}
```

Replace `savePlanAsProtocol` with:

```ts
export async function savePlanAsProtocol(planId: number, name: string, description: string | null, createdBy?: number): Promise<number> {
  const guide = await getPlanGuide(planId);
  const rs = await execute(
    `INSERT INTO protocols (name, description, created_by, next_consultation, lifestyle, dietary, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name.trim(), description?.trim() || null, createdBy ?? null,
     guide?.nextConsultation ?? null, guide?.lifestyle ?? null, guide?.dietary ?? null, guide?.notes ?? null]
  );
  const protocolId = Number(rs.lastInsertRowid);
  const items = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null; position: number }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size, position FROM plan_items WHERE plan_id = ? ORDER BY position",
    [planId]
  );
  for (const it of items) {
    await execute(
      `INSERT INTO protocol_items (protocol_id, product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [protocolId, it.product_id, it.dosing_preset_id, it.dosing_custom_text, it.note, it.duration, it.order_code, it.size, it.position]
    );
  }
  return protocolId;
}
```

Replace `getProtocol` with:

```ts
export async function getProtocol(id: number): Promise<ProtocolDetail | null> {
  const base = await query<{ id: number; name: string; description: string | null; next_consultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null }>(
    "SELECT id, name, description, next_consultation, lifestyle, dietary, notes FROM protocols WHERE id = ?", [id]
  );
  if (!base[0]) return null;
  const rows = await query<{ item_id: number; product_id: number; product_name: string; brand_name: string; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null }>(
    `SELECT pi.id AS item_id, pi.product_id, pr.name AS product_name, b.name AS brand_name, pi.dosing_preset_id, pi.dosing_custom_text,
            pi.note, pi.duration, pi.order_code, pi.size
     FROM protocol_items pi JOIN products pr ON pr.id = pi.product_id JOIN brands b ON b.id = pr.brand_id
     WHERE pi.protocol_id = ? ORDER BY pi.position`, [id]
  );
  const items: ProtocolItem[] = [];
  for (const r of rows) {
    items.push({
      itemId: r.item_id, productId: r.product_id, productName: r.product_name, brandName: r.brand_name,
      dosingPresetId: r.dosing_preset_id, dosingCustomText: r.dosing_custom_text,
      dosingText: await dosingTextFor(r.dosing_preset_id, r.dosing_custom_text),
      note: r.note, duration: r.duration, orderCode: r.order_code, size: r.size,
    });
  }
  const b = base[0];
  return {
    id: b.id, name: b.name, description: b.description, items,
    nextConsultation: b.next_consultation, lifestyle: b.lifestyle, dietary: b.dietary, notes: b.notes,
  };
}
```

Replace `applyProtocolToPlan` with:

```ts
export async function applyProtocolToPlan(protocolId: number, planId: number): Promise<number> {
  const rows = await query<{ product_id: number; dosing_preset_id: number | null; dosing_custom_text: string | null; note: string | null; duration: string | null; order_code: string | null; size: string | null }>(
    "SELECT product_id, dosing_preset_id, dosing_custom_text, note, duration, order_code, size FROM protocol_items WHERE protocol_id = ? ORDER BY position",
    [protocolId]
  );
  let added = 0;
  for (const r of rows) {
    const itemId = await addPlanItem(planId, r.product_id);
    if (r.dosing_preset_id || r.dosing_custom_text) await setItemDosing(itemId, r.dosing_preset_id, r.dosing_custom_text);
    if (r.note) await setItemNote(itemId, r.note);
    if (r.duration) await setItemDuration(itemId, r.duration);
    if (r.size) await setItemSize(itemId, r.size);
    if (r.order_code !== null) await setItemOrderCodeStored(itemId, r.order_code);
    added++;
  }

  // Page 2: fill empty sections, append under ones that already have text. The intro,
  // medications and consultation date are never touched.
  const sec = await query<{ next_consultation: string | null; lifestyle: string | null; dietary: string | null; notes: string | null }>(
    "SELECT next_consultation, lifestyle, dietary, notes FROM protocols WHERE id = ?", [protocolId]
  );
  const p = sec[0];
  if (p && (p.next_consultation || p.lifestyle || p.dietary || p.notes)) {
    const g = (await getPlanGuide(planId)) ?? {
      consultationDate: null, intro: null, nextConsultation: null, lifestyle: null,
      dietary: null, supplementText: null, medsText: null, notes: null,
    };
    const orNull = (s: string) => (s ? s : null);
    await savePlanGuide(planId, {
      ...g,
      nextConsultation: orNull(mergeSection(g.nextConsultation, p.next_consultation)),
      lifestyle: orNull(mergeSection(g.lifestyle, p.lifestyle)),
      dietary: orNull(mergeSection(g.dietary, p.dietary)),
      notes: orNull(mergeSection(g.notes, p.notes)),
    });
  }
  return added;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/text-merge.test.ts test/protocols.test.ts test/plans.test.ts`
Expected: PASS (the two original protocol tests still pass unchanged).

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add lib/text-merge.ts lib/plans.ts lib/protocols.ts scripts/migrate.ts test/text-merge.test.ts test/protocols.test.ts
git commit -F - <<'EOF'
Protocols: save and apply both pages of a plan

"Save as protocol" now keeps every item field (dosing, note, duration, pack size,
order code) plus the next-consultation, lifestyle, dietary and notes text. Applying
a protocol fills empty sections and appends under filled ones; the intro,
medications and consultation date stay with the patient. Older protocols apply as
before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4: Protocol builder edits page 2 + deploy Workstream B

**Files:**
- Modify: `app/protocols/actions.ts`, `app/protocols/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateProtocolSections(id, ProtocolSections)` and the extended `ProtocolDetail` / `ProtocolItem` from Task 3.
- Produces: server action `updateProtocolSectionsAction(formData: FormData)`.

- [ ] **Step 1: Add the server action**

In `app/protocols/actions.ts`, add `updateProtocolSections` to the import list from `@/lib/protocols`, then add:

```ts
export async function updateProtocolSectionsAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const v = (k: string) => String(formData.get(k) ?? "").replace(/\r\n/g, "\n");
  await updateProtocolSections(id, {
    nextConsultation: v("nextConsultation"), lifestyle: v("lifestyle"), dietary: v("dietary"), notes: v("notes"),
  });
  revalidatePath(`/protocols/${id}`);
}
```

- [ ] **Step 2: Add the page-2 editor and item extras to the builder page**

In `app/protocols/[id]/page.tsx`, add `updateProtocolSectionsAction` to the import list from `@/app/protocols/actions`.

Insert this card directly after the "Details" card (after its closing `</div>`):

```tsx
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Guide text (page 2)</h2>
        <p className="muted-xs" style={{ marginBottom: 12 }}>
          When applied to a plan, each section fills an empty section or is added underneath existing text.
          The personal intro, medications and consultation date are never part of a protocol — they belong to each patient.
        </p>
        <form action={updateProtocolSectionsAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={protocol.id} />
          <label className="stack" style={{ gap: 5 }}><span>Next consultation</span>
            <textarea name="nextConsultation" rows={2} defaultValue={protocol.nextConsultation ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Lifestyle &amp; other recommendations</span>
            <textarea name="lifestyle" rows={4} defaultValue={protocol.lifestyle ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Dietary recommendations</span>
            <textarea name="dietary" rows={4} defaultValue={protocol.dietary ?? ""} />
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Notes</span>
            <textarea name="notes" rows={3} defaultValue={protocol.notes ?? ""} />
          </label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save guide text</button>
        </form>
      </div>
```

In the items list, inside each item card, replace:

```tsx
                  <div className="muted-xs" style={{ marginTop: 1 }}>{item.brandName}</div>
```

with:

```tsx
                  <div className="muted-xs" style={{ marginTop: 1 }}>{item.brandName}</div>
                  {[item.duration, item.size, item.note, item.orderCode ? `code ${item.orderCode}` : null].some(Boolean) && (
                    <div className="muted-xs" style={{ marginTop: 4 }}>
                      {[item.duration, item.size, item.note, item.orderCode ? `code ${item.orderCode}` : null].filter(Boolean).join("  ·  ")}
                    </div>
                  )}
```

- [ ] **Step 3: Typecheck and full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all test files pass.

- [ ] **Step 4: Commit**

```bash
git add app/protocols/actions.ts "app/protocols/[id]/page.tsx"
git commit -F - <<'EOF'
Protocols: edit the guide text in the builder and show item details

The protocol page gains a "Guide text (page 2)" editor for next consultation,
lifestyle, dietary and notes, and each product shows its saved duration, pack size,
note and code.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Deploy Workstream B and verify on the live app**

Ask the user for the go-ahead, then `git push origin main`, wait for `● Ready`, and confirm the build log shows the migration ran:
`npx --yes vercel inspect --logs <deployment-url> 2>&1 | grep -i "migrations applied"`.
Verify in the browser pane (lorna123), using a test patient:
1. History → "Duplicate → new draft" on a finalised plan → open the new draft's Prepare page: intro/recommendations/notes are filled; date of consultation shows today's default (it was stored blank).
2. On a plan with page-2 text, "Save as protocol" named `ZZ verify protocol` → open it under Protocols: the Guide text card shows the sections; items show duration/size/note.
3. Apply `ZZ verify protocol` to another test patient's draft → Prepare page shows the merged text.
4. Clean up: delete `ZZ verify protocol` from the Protocols page and delete the test drafts from `/plans/drafts`.

---

## Workstream C — managed lists

### Task 5: Dosing presets admin

**Files:**
- Create: `lib/dosing.ts`, `app/admin/dosing/page.tsx`, `app/admin/dosing/actions.ts`, `test/dosing.test.ts`
- Modify: `scripts/migrate.ts`, `components/AppShell.tsx`, `app/plan/[patientId]/page.tsx:8,24-31`, `app/protocols/[id]/page.tsx` (imports + presets load)

**Interfaces:**
- Produces: `type DosingPreset = { id: number; label: string; text: string }`; `listDosingPresets(): Promise<DosingPreset[]>` (active only, ordered by label); `createDosingPreset(label, text): Promise<number | null>`; `updateDosingPreset(id, label, text): Promise<void>`; `archiveDosingPreset(id): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `test/dosing.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { listDosingPresets, createDosingPreset, updateDosingPreset, archiveDosingPreset } from "@/lib/dosing";
import { dosingTextFor } from "@/lib/plans";

describe("dosing presets", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists and edits a preset (trimmed)", async () => {
    const id = (await createDosingPreset(`  Zz test ${Date.now()} `, " 2 capsules at bedtime "))!;
    let p = (await listDosingPresets()).find((x) => x.id === id)!;
    expect(p.text).toBe("2 capsules at bedtime");
    await updateDosingPreset(id, p.label, "3 capsules at bedtime");
    p = (await listDosingPresets()).find((x) => x.id === id)!;
    expect(p.text).toBe("3 capsules at bedtime");
  });

  it("rejects an empty label or wording", async () => {
    expect(await createDosingPreset("", "x")).toBeNull();
    expect(await createDosingPreset("x", "  ")).toBeNull();
  });

  it("archiving hides a preset from the list but its wording still resolves for existing items", async () => {
    const id = (await createDosingPreset(`Archive me ${Date.now()}`, "1 sachet in water"))!;
    await archiveDosingPreset(id);
    expect((await listDosingPresets()).some((x) => x.id === id)).toBe(false);
    expect(await dosingTextFor(id, null)).toBe("1 sachet in water");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/dosing.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/dosing"`.

- [ ] **Step 3: Implement the migration and library**

In `scripts/migrate.ts`, add at the end of `runMigrations`:

```ts
  await ensureColumn("dosing_presets", "archived", "INTEGER NOT NULL DEFAULT 0"); // "deleted" presets stay resolvable
```

Create `lib/dosing.ts`:

```ts
import { query, execute } from "@/lib/db";

export type DosingPreset = { id: number; label: string; text: string };

// Active presets, as offered in the plan and protocol builders.
export async function listDosingPresets(): Promise<DosingPreset[]> {
  return query<DosingPreset>("SELECT id, label, text FROM dosing_presets WHERE archived = 0 ORDER BY label");
}

export async function createDosingPreset(label: string, text: string): Promise<number | null> {
  const l = label.trim(), t = text.trim();
  if (!l || !t) return null;
  const rs = await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [l, t]);
  return Number(rs.lastInsertRowid);
}

export async function updateDosingPreset(id: number, label: string, text: string): Promise<void> {
  const l = label.trim(), t = text.trim();
  if (!l || !t) return;
  await execute("UPDATE dosing_presets SET label = ?, text = ? WHERE id = ?", [l, t, id]);
}

// "Delete" hides a preset from every picker but keeps the row: plan items reference
// presets by id and resolve the wording at render time, so a hard delete would blank
// the dosing on drafts that use it.
export async function archiveDosingPreset(id: number): Promise<void> {
  await execute("UPDATE dosing_presets SET archived = 1 WHERE id = ?", [id]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/dosing.test.ts`
Expected: PASS.

- [ ] **Step 5: Admin page, actions and sidebar link**

Create `app/admin/dosing/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createDosingPreset, updateDosingPreset, archiveDosingPreset } from "@/lib/dosing";

export async function addDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await createDosingPreset(String(formData.get("label") || ""), String(formData.get("text") || ""));
  revalidatePath("/admin/dosing");
}

export async function updateDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await updateDosingPreset(Number(formData.get("id")), String(formData.get("label") || ""), String(formData.get("text") || ""));
  revalidatePath("/admin/dosing");
}

export async function deleteDosingPresetAction(formData: FormData) {
  await requireAdmin();
  await archiveDosingPreset(Number(formData.get("id")));
  revalidatePath("/admin/dosing");
}
```

Create `app/admin/dosing/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { listDosingPresets } from "@/lib/dosing";
import PageHeader from "@/components/PageHeader";
import { addDosingPresetAction, updateDosingPresetAction, deleteDosingPresetAction } from "@/app/admin/dosing/actions";

export default async function DosingPresetsPage() {
  await requireAdmin();
  const presets = await listDosingPresets();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Practice settings"
        title="Dosing presets"
        subtitle="The ready-made dosing instructions offered on every plan item. Edit the wording, add your own, or remove ones you don't use."
      />

      <div className="card">
        <form action={addDosingPresetAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="label" placeholder="Short name, e.g. Bedtime x2" required style={{ minWidth: 180 }} />
          <input name="text" placeholder="Wording on the plan, e.g. 2 capsules at bedtime" required style={{ flex: 1, minWidth: 240 }} />
          <button type="submit" className="btn--primary">Add</button>
        </form>
        <p className="muted-xs" style={{ marginTop: 8 }}>The short name appears in the dropdown; the wording is what prints on the plan.</p>
      </div>

      <div className="card">
        {presets.length === 0 ? (
          <p className="muted">No dosing presets yet. Add the instructions you use most.</p>
        ) : presets.map((p) => (
          <div key={p.id} className="list-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <form action={updateDosingPresetAction} style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={p.id} />
              <input name="label" defaultValue={p.label} required style={{ minWidth: 160 }} />
              <input name="text" defaultValue={p.text} required style={{ flex: 1, minWidth: 220 }} />
              <button type="submit" className="btn--sm">Save</button>
            </form>
            <form action={deleteDosingPresetAction}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn--sm">Remove</button>
            </form>
          </div>
        ))}
      </div>
      <p className="muted-xs">Removing a preset hides it from new choices. Plans that already use it keep their wording.</p>
    </div>
  );
}
```

In `components/AppShell.tsx`, add after the Notes entry:

```ts
      { href: "/admin/dosing", label: "Dosing presets", icon: "note" },
```

- [ ] **Step 6: Use active presets in the plan and protocol builders**

In `app/plan/[patientId]/page.tsx`: add `import { listDosingPresets } from "@/lib/dosing";`, replace the line
`    query<{ id: number; label: string }>("SELECT id, label FROM dosing_presets ORDER BY id"),`
with
`    listDosingPresets(),`
and delete `import { query } from "@/lib/db";` (it has no other use in this file).

In `app/protocols/[id]/page.tsx`: make the same three changes (add the `listDosingPresets` import, replace the `query<…>("SELECT id, label FROM dosing_presets ORDER BY id")` call with `listDosingPresets()`, delete the now-unused `import { query } from "@/lib/db";`).

- [ ] **Step 7: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add lib/dosing.ts scripts/migrate.ts app/admin/dosing components/AppShell.tsx "app/plan/[patientId]/page.tsx" "app/protocols/[id]/page.tsx" test/dosing.test.ts
git commit -F - <<'EOF'
Admin: manage dosing presets

New Admin → Dosing presets page to add, edit and remove the dosing instructions
offered on plan items. Removing hides a preset from new choices but keeps its
wording for plans that already use it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 6: Discount codes per brand

**Files:**
- Create: `lib/brand-codes.ts`, `test/brand-codes.test.ts`
- Modify: `lib/schema.sql` (append table), `scripts/migrate.ts`, `lib/products.ts` (3 SELECTs), `lib/brands.ts`, `app/catalog/brands/page.tsx`, `app/catalog/brands/actions.ts`, `test/guide.test.ts:117`

**Interfaces:**
- Produces: `type BrandCode = { id: number; brandId: number; code: string; isDefault: boolean }`; `listBrandCodes(brandId): Promise<BrandCode[]>`; `listAllBrandCodes(): Promise<Map<number, BrandCode[]>>`; `addBrandCode(brandId, code, makeDefault = false): Promise<void>`; `deleteBrandCode(id): Promise<void>`; `setDefaultBrandCode(codeId): Promise<void>`; `clearDefaultBrandCode(brandId): Promise<void>`. `ProductDetail.brand_promo_code` now = the brand's default code (or null).

- [ ] **Step 1: Write the failing tests**

Create `test/brand-codes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, getProductsByIds } from "@/lib/products";
import { execute, query } from "@/lib/db";
import { listBrandCodes, addBrandCode, deleteBrandCode, setDefaultBrandCode, clearDefaultBrandCode } from "@/lib/brand-codes";

describe("brand codes", () => {
  beforeAll(async () => { await runMigrations(); });

  it("adds codes per brand, ignoring duplicates and blanks", async () => {
    const brandId = await createBrand({ name: `Codes ${Date.now()}` });
    await addBrandCode(brandId, " WN10 ");
    await addBrandCode(brandId, "WN10");
    await addBrandCode(brandId, "  ");
    await addBrandCode(brandId, "WN15");
    expect((await listBrandCodes(brandId)).map((c) => c.code)).toEqual(["WN10", "WN15"]);
  });

  it("keeps at most one default per brand and exposes it as the product's brand code", async () => {
    const brandId = await createBrand({ name: `Default ${Date.now()}` });
    await addBrandCode(brandId, "A10", true);
    await addBrandCode(brandId, "B20", true);
    const codes = await listBrandCodes(brandId);
    expect(codes.filter((c) => c.isDefault).map((c) => c.code)).toEqual(["B20"]);

    const pid = await createProduct({ brandId, name: "Default Mag", form: "capsule" });
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBe("B20");

    await setDefaultBrandCode(codes.find((c) => c.code === "A10")!.id);
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBe("A10");

    await clearDefaultBrandCode(brandId);
    expect((await getProductsByIds([pid])).get(pid)!.brand_promo_code).toBeNull();
  });

  it("deletes a code", async () => {
    const brandId = await createBrand({ name: `Delete ${Date.now()}` });
    await addBrandCode(brandId, "GONE");
    const [c] = await listBrandCodes(brandId);
    await deleteBrandCode(c.id);
    expect(await listBrandCodes(brandId)).toEqual([]);
  });

  it("migration moves a legacy brand promo code into the list as the default, once", async () => {
    const brandId = await createBrand({ name: `Legacy ${Date.now()}` });
    await execute("UPDATE brands SET promo_code = ? WHERE id = ?", ["OLD5", brandId]);
    await runMigrations();
    expect(await listBrandCodes(brandId)).toMatchObject([{ code: "OLD5", isDefault: true }]);
    const [b] = await query<{ promo_code: string | null }>("SELECT promo_code FROM brands WHERE id = ?", [brandId]);
    expect(b.promo_code).toBeNull();
    // Deleting every code and re-running migrations must not bring the old code back.
    for (const c of await listBrandCodes(brandId)) await deleteBrandCode(c.id);
    await runMigrations();
    expect(await listBrandCodes(brandId)).toEqual([]);
  });
});
```

In `test/guide.test.ts`, add `import { addBrandCode } from "@/lib/brand-codes";` and replace line 117
`    await execute("UPDATE brands SET promo_code = ? WHERE id = ?", ["BRAND20", brandId]);`
with
`    await addBrandCode(brandId, "BRAND20", true);`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/brand-codes.test.ts test/guide.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/brand-codes"`.

- [ ] **Step 3: Schema and migration**

Append to the end of `lib/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS brand_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE (brand_id, code)
);
```

In `scripts/migrate.ts`, add at the end of `runMigrations`:

```ts
  // One-time move of the old single per-brand promo code into the brand's code list as
  // its default, then clear it so deleting codes later never brings it back.
  await execute(
    `INSERT INTO brand_codes (brand_id, code, is_default)
     SELECT b.id, trim(b.promo_code), 1 FROM brands b
     WHERE b.promo_code IS NOT NULL AND trim(b.promo_code) <> ''
       AND NOT EXISTS (SELECT 1 FROM brand_codes bc WHERE bc.brand_id = b.id)`
  );
  await execute(
    `UPDATE brands SET promo_code = NULL
     WHERE promo_code IS NOT NULL AND EXISTS (SELECT 1 FROM brand_codes bc WHERE bc.brand_id = brands.id)`
  );
```

- [ ] **Step 4: Library**

Create `lib/brand-codes.ts`:

```ts
import { query, execute } from "@/lib/db";

export type BrandCode = { id: number; brandId: number; code: string; isDefault: boolean };

type Row = { id: number; brand_id: number; code: string; is_default: number };
const toCode = (r: Row): BrandCode => ({ id: r.id, brandId: r.brand_id, code: r.code, isDefault: r.is_default === 1 });

export async function listBrandCodes(brandId: number): Promise<BrandCode[]> {
  const rows = await query<Row>("SELECT id, brand_id, code, is_default FROM brand_codes WHERE brand_id = ? ORDER BY code", [brandId]);
  return rows.map(toCode);
}

// Every brand's codes in one query, keyed by brand id (for pages that show many brands).
export async function listAllBrandCodes(): Promise<Map<number, BrandCode[]>> {
  const rows = await query<Row>("SELECT id, brand_id, code, is_default FROM brand_codes ORDER BY code");
  const map = new Map<number, BrandCode[]>();
  for (const r of rows) {
    const list = map.get(r.brand_id) ?? [];
    list.push(toCode(r));
    map.set(r.brand_id, list);
  }
  return map;
}

export async function addBrandCode(brandId: number, code: string, makeDefault = false): Promise<void> {
  const c = code.trim();
  if (!c) return;
  await execute("INSERT OR IGNORE INTO brand_codes (brand_id, code) VALUES (?, ?)", [brandId, c]);
  if (makeDefault) {
    const rows = await query<{ id: number }>("SELECT id FROM brand_codes WHERE brand_id = ? AND code = ?", [brandId, c]);
    if (rows[0]) await setDefaultBrandCode(rows[0].id);
  }
}

export async function deleteBrandCode(id: number): Promise<void> {
  await execute("DELETE FROM brand_codes WHERE id = ?", [id]);
}

// Make one code the brand's default, clearing any other default for that brand.
export async function setDefaultBrandCode(codeId: number): Promise<void> {
  const rows = await query<{ brand_id: number }>("SELECT brand_id FROM brand_codes WHERE id = ?", [codeId]);
  if (!rows[0]) return;
  await execute("UPDATE brand_codes SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE brand_id = ?", [codeId, rows[0].brand_id]);
}

export async function clearDefaultBrandCode(brandId: number): Promise<void> {
  await execute("UPDATE brand_codes SET is_default = 0 WHERE brand_id = ?", [brandId]);
}
```

In `lib/products.ts`, replace every occurrence (3) of
`b.promo_code AS brand_promo_code`
with
`(SELECT bc.code FROM brand_codes bc WHERE bc.brand_id = b.id AND bc.is_default = 1 LIMIT 1) AS brand_promo_code`

In `lib/brands.ts`: change the `Brand` type to `export type Brand = { id: number; name: string; website: string|null; logo_url: string|null };`, change `listBrands`'s SQL to `SELECT id, name, website, logo_url FROM brands ORDER BY name`, and delete `setBrandPromoCode` together with its comment.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/brand-codes.test.ts test/guide.test.ts test/products.test.ts`
Expected: PASS.

- [ ] **Step 6: Brands page and actions**

Replace `app/catalog/brands/actions.ts` with:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { createBrand } from "@/lib/brands";
import { addBrandCode, deleteBrandCode, setDefaultBrandCode } from "@/lib/brand-codes";

export async function addBrandAction(formData: FormData) {
  await requireUser();
  await createBrand({ name: String(formData.get("name")), website: String(formData.get("website") || "") });
  revalidatePath("/catalog/brands");
}

export async function addBrandCodeAction(formData: FormData) {
  await requireUser();
  await addBrandCode(Number(formData.get("brandId")), String(formData.get("code") || ""), formData.get("makeDefault") === "on");
  revalidatePath("/catalog/brands");
}

export async function deleteBrandCodeAction(formData: FormData) {
  await requireUser();
  await deleteBrandCode(Number(formData.get("id")));
  revalidatePath("/catalog/brands");
}

export async function setDefaultBrandCodeAction(formData: FormData) {
  await requireUser();
  await setDefaultBrandCode(Number(formData.get("id")));
  revalidatePath("/catalog/brands");
}
```

Replace `app/catalog/brands/page.tsx` with:

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { listAllBrandCodes } from "@/lib/brand-codes";
import { addBrandAction, addBrandCodeAction, deleteBrandCodeAction, setDefaultBrandCodeAction } from "./actions";

export default async function BrandsPage() {
  await requireUser();
  const [brands, codesByBrand] = await Promise.all([listBrands(), listAllBrandCodes()]);
  const tiny = { height: 22, padding: "0 6px" } as const;
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
      <div className="row-between">
        <h1>Brands</h1>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <p className="muted-xs" style={{ margin: 0 }}>
        Each brand&apos;s discount codes appear in the Order code dropdown on that brand&apos;s plan items.
        The default code is pre-selected; you can pick another code or &ldquo;No code&rdquo; on any item.
      </p>
      <div className="card">
        {brands.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>No brands yet.</p>}
        {brands.map((b) => {
          const codes = codesByBrand.get(b.id) ?? [];
          return (
            <div key={b.id} className="stack" style={{ gap: 8, padding: "12px 0", borderBottom: "1px solid var(--sand-border)" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{b.name}</div>
                {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="muted-xs">{b.website}</a>}
              </div>
              {codes.length === 0 ? <p className="muted-xs" style={{ margin: 0 }}>No discount codes yet.</p> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {codes.map((c) => (
                    <span key={c.id} className="badge badge--neutral" style={{ display: "inline-flex", gap: 6, alignItems: "center", height: "auto", padding: "4px 8px" }}>
                      <strong>{c.code}</strong>
                      {c.isDefault ? <span className="muted-xs">default</span> : (
                        <form action={setDefaultBrandCodeAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn--sm" style={tiny} title="Pre-select this code on plan items">Make default</button>
                        </form>
                      )}
                      <form action={deleteBrandCodeAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn--sm" style={tiny} title="Remove this code">✕</button>
                      </form>
                    </span>
                  ))}
                </div>
              )}
              <form action={addBrandCodeAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="brandId" value={b.id} />
                <input name="code" placeholder="New code, e.g. LORNA10" required style={{ maxWidth: 200 }} />
                <label className="muted-xs" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" name="makeDefault" /> make default
                </label>
                <button type="submit" className="btn--sm">Add code</button>
              </form>
            </div>
          );
        })}
        <form action={addBrandAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <input name="name" placeholder="Brand name" required />
          <input name="website" placeholder="https://…" />
          <button type="submit" className="btn--sm btn--primary">Add</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add lib/schema.sql scripts/migrate.ts lib/brand-codes.ts lib/products.ts lib/brands.ts app/catalog/brands test/brand-codes.test.ts test/guide.test.ts
git commit -F - <<'EOF'
Catalog: discount codes per brand, with a default

Each brand now holds a list of discount codes (add, remove, make default) on the
Brands page, replacing the single promo-code field. Existing promo codes move into
the list automatically as each brand's default.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7: Order-code dropdown on plan items

**Files:**
- Create: `lib/order-codes.ts`, `test/order-codes.test.ts`
- Modify: `lib/guide.ts` (code line in `buildSupplementRows`), `app/plan/actions.ts:5,39`, `components/PlanItemFields.tsx`, `app/plan/[patientId]/page.tsx`, `test/guide.test.ts`

**Interfaces:**
- Consumes: `setItemOrderCodeStored` (Task 3), `listAllBrandCodes` (Task 6).
- Produces from `@/lib/order-codes`: `ORDER_DEFAULT = "__default"`, `ORDER_NONE = "__none"`, `storedFromFormValue(value): string | null`, `formValueFromStored(stored: string | null): string`, `resolveOrderCode(stored: string | null, brandDefault: string | null): string`. `PlanItemFields` gains prop `brandCodes: { code: string; isDefault: boolean }[]`.

- [ ] **Step 1: Write the failing tests**

Create `test/order-codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ORDER_DEFAULT, ORDER_NONE, storedFromFormValue, formValueFromStored, resolveOrderCode } from "@/lib/order-codes";

describe("order codes", () => {
  it("maps dropdown values to stored values", () => {
    expect(storedFromFormValue(ORDER_DEFAULT)).toBeNull();
    expect(storedFromFormValue("")).toBeNull();
    expect(storedFromFormValue(ORDER_NONE)).toBe("");
    expect(storedFromFormValue(" WN10 ")).toBe("WN10");
  });
  it("maps stored values back to dropdown values", () => {
    expect(formValueFromStored(null)).toBe(ORDER_DEFAULT);
    expect(formValueFromStored("")).toBe(ORDER_NONE);
    expect(formValueFromStored("WN10")).toBe("WN10");
  });
  it("resolves what prints on the plan", () => {
    expect(resolveOrderCode(null, "BRAND20")).toBe("BRAND20");
    expect(resolveOrderCode(null, null)).toBe("");
    expect(resolveOrderCode("", "BRAND20")).toBe("");
    expect(resolveOrderCode("WN10", "BRAND20")).toBe("WN10");
  });
});
```

In `test/guide.test.ts`, add `setItemOrderCodeStored` to the import list from `@/lib/plans` and add inside the top-level `describe`:

```ts
  it("supplement row: 'No code' on an item suppresses the brand default", async () => {
    const brandId = await createBrand({ name: `NoCode ${Date.now()}` });
    await addBrandCode(brandId, "BRAND20", true);
    const pid = await createProduct({ brandId, name: "NoCode Mag", form: "capsule" });
    const planId = await getOrCreateDraftPlan(await createPatient({ name: "NoCode P", dob: "1990-01-01" }));
    const itemId = await addPlanItem(planId, pid);
    await setItemOrderCodeStored(itemId, "");
    const [row] = buildSupplementRows((await getPlan(planId))!);
    expect(row.code).toBe("");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/order-codes.test.ts test/guide.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/order-codes"`, and the guide test fails with `expected 'BRAND20' to be ''`.

- [ ] **Step 3: Implement the helpers and use them in the supplement rows**

Create `lib/order-codes.ts`:

```ts
// How a plan item's order code is stored, and how the Order code dropdown maps to it.
// Dependency-free so the client-side item form can import it.
//   stored null → follow the brand's default code (how items behaved before code lists)
//   stored ""   → explicitly no code on this item
//   stored "X"  → print code X
export const ORDER_DEFAULT = "__default";
export const ORDER_NONE = "__none";

export function storedFromFormValue(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || v === ORDER_DEFAULT) return null;
  if (v === ORDER_NONE) return "";
  return v;
}

export function formValueFromStored(stored: string | null): string {
  if (stored === null) return ORDER_DEFAULT;
  if (stored.trim() === "") return ORDER_NONE;
  return stored.trim();
}

export function resolveOrderCode(stored: string | null, brandDefault: string | null): string {
  if (stored === null) return (brandDefault ?? "").trim();
  return stored.trim();
}
```

In `lib/guide.ts`, add `import { resolveOrderCode } from "@/lib/order-codes";` and in `buildSupplementRows` replace

```ts
    // Per-item order code overrides the brand's promo code.
    const code = (it.orderCode?.trim()) || (it.product.brand_promo_code?.trim()) || "";
```

with

```ts
    // Item's chosen code, the brand default, or explicitly none (see lib/order-codes.ts).
    const code = resolveOrderCode(it.orderCode, it.product.brand_promo_code);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/order-codes.test.ts test/guide.test.ts test/plans.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the dropdown**

In `app/plan/actions.ts`, in the `@/lib/plans` import replace `setItemOrderCode` with `setItemOrderCodeStored`, add `import { storedFromFormValue } from "@/lib/order-codes";`, and in `saveItemFieldsAction` replace

```ts
  await setItemOrderCode(itemId, String(formData.get("orderCode") || ""));
```

with

```ts
  await setItemOrderCodeStored(itemId, storedFromFormValue(String(formData.get("orderCode") ?? "")));
```

In `components/PlanItemFields.tsx`:
- add `import { ORDER_DEFAULT, ORDER_NONE, formValueFromStored } from "@/lib/order-codes";`
- add `brandCodes,` to the destructured props and `brandCodes: { code: string; isDefault: boolean }[];` to the props type;
- directly after `const [note, setNote] = useState(currentNote ?? "");` add:

```ts
  const defaultCode = brandCodes.find((c) => c.isDefault)?.code ?? null;
  const storedCode = currentOrderCode?.trim() ?? null;
  // A code saved on this item that has since been removed from the brand's list stays
  // selectable, so saving the form never silently drops it.
  const unlistedCode = storedCode && !brandCodes.some((c) => c.code === storedCode) ? storedCode : null;
```

- replace the whole "Order code" `<label className="field">…</label>` block with:

```tsx
      <label className="field">
        <span className="field__label">Order code <span className="field__hint">from this brand&apos;s codes</span></span>
        <select name="orderCode" defaultValue={formValueFromStored(currentOrderCode)}>
          <option value={ORDER_DEFAULT}>{defaultCode ? `Brand default (${defaultCode})` : "Brand default (none set)"}</option>
          {brandCodes.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
          {unlistedCode && <option value={unlistedCode}>{unlistedCode} (no longer listed)</option>}
          <option value={ORDER_NONE}>No code</option>
        </select>
      </label>
```

In `app/plan/[patientId]/page.tsx`:
- add `import { listAllBrandCodes } from "@/lib/brand-codes";`
- change the destructuring to `const [patient, planId, presets, allProducts, protocols, snippets, codesByBrand] = await Promise.all([` and add `    listAllBrandCodes(),` as the last array entry (after `listSnippets(),`);
- add this prop to `<PlanItemFields …>`:

```tsx
                  brandCodes={(codesByBrand.get(item.product.brand_id) ?? []).map((c) => ({ code: c.code, isDefault: c.isDefault }))}
```

- [ ] **Step 6: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add lib/order-codes.ts lib/guide.ts app/plan/actions.ts components/PlanItemFields.tsx "app/plan/[patientId]/page.tsx" test/order-codes.test.ts test/guide.test.ts
git commit -F - <<'EOF'
Plans: pick the order code from the brand's list

The free-text Order code box becomes a dropdown: the brand default (pre-selected),
any of the brand's codes, or "No code". Existing items keep following their brand's
default as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 8: Dietary protocols + deploy Workstream C

**Files:**
- Create: `lib/dietary-protocols.ts`, `app/admin/dietary-protocols/page.tsx`, `app/admin/dietary-protocols/actions.ts`, `test/dietary-protocols.test.ts`
- Modify: `lib/schema.sql` (append table), `components/AppShell.tsx`, `components/SnippetTextarea.tsx`, `app/plan/[patientId]/prepare/page.tsx`

**Interfaces:**
- Consumes: `mergeSection` (Task 3).
- Produces: `type DietaryProtocol = { id: number; name: string; body: string }`; `listDietaryProtocols()`, `createDietaryProtocol(name, body, createdBy?): Promise<number | null>`, `updateDietaryProtocol(id, name, body)`, `deleteDietaryProtocol(id)`. `SnippetTextarea` gains optional props `blocks?: { id: number; name: string; body: string }[]` and `blocksLabel?: string`.

- [ ] **Step 1: Write the failing tests**

Create `test/dietary-protocols.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { listDietaryProtocols, createDietaryProtocol, updateDietaryProtocol, deleteDietaryProtocol } from "@/lib/dietary-protocols";

describe("dietary protocols", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists, edits and deletes a dietary protocol", async () => {
    const id = (await createDietaryProtocol(` Low-FODMAP ${Date.now()} `, "Avoid onion and garlic.\r\nTry lactose-free."))!;
    let p = (await listDietaryProtocols()).find((x) => x.id === id)!;
    expect(p.body).toBe("Avoid onion and garlic.\nTry lactose-free.");
    await updateDietaryProtocol(id, p.name, "Reintroduce one food at a time.");
    p = (await listDietaryProtocols()).find((x) => x.id === id)!;
    expect(p.body).toBe("Reintroduce one food at a time.");
    await deleteDietaryProtocol(id);
    expect((await listDietaryProtocols()).some((x) => x.id === id)).toBe(false);
  });

  it("rejects a blank name or body", async () => {
    expect(await createDietaryProtocol("", "x")).toBeNull();
    expect(await createDietaryProtocol("x", " ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/dietary-protocols.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/dietary-protocols"`.

- [ ] **Step 3: Schema and library**

Append to the end of `lib/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS dietary_protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Create `lib/dietary-protocols.ts`:

```ts
import { query, execute } from "@/lib/db";

export type DietaryProtocol = { id: number; name: string; body: string };

export async function listDietaryProtocols(): Promise<DietaryProtocol[]> {
  return query<DietaryProtocol>("SELECT id, name, body FROM dietary_protocols ORDER BY name");
}

const cleanBody = (b: string) => b.replace(/\r\n/g, "\n").trim();

export async function createDietaryProtocol(name: string, body: string, createdBy?: number): Promise<number | null> {
  const n = name.trim(), b = cleanBody(body);
  if (!n || !b) return null;
  const rs = await execute("INSERT INTO dietary_protocols (name, body, created_by) VALUES (?, ?, ?)", [n, b, createdBy ?? null]);
  return Number(rs.lastInsertRowid);
}

export async function updateDietaryProtocol(id: number, name: string, body: string): Promise<void> {
  const n = name.trim(), b = cleanBody(body);
  if (!n || !b) return;
  await execute("UPDATE dietary_protocols SET name = ?, body = ? WHERE id = ?", [n, b, id]);
}

// Inserted text is copied into the plan, so deleting a template never changes a plan.
export async function deleteDietaryProtocol(id: number): Promise<void> {
  await execute("DELETE FROM dietary_protocols WHERE id = ?", [id]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/dietary-protocols.test.ts`
Expected: PASS.

- [ ] **Step 5: Admin page, actions and sidebar link**

Create `app/admin/dietary-protocols/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createDietaryProtocol, updateDietaryProtocol, deleteDietaryProtocol } from "@/lib/dietary-protocols";

export async function addDietaryProtocolAction(formData: FormData) {
  const u = await requireAdmin();
  await createDietaryProtocol(String(formData.get("name") || ""), String(formData.get("body") || ""), u.userId);
  revalidatePath("/admin/dietary-protocols");
}

export async function updateDietaryProtocolAction(formData: FormData) {
  await requireAdmin();
  await updateDietaryProtocol(Number(formData.get("id")), String(formData.get("name") || ""), String(formData.get("body") || ""));
  revalidatePath("/admin/dietary-protocols");
}

export async function deleteDietaryProtocolAction(formData: FormData) {
  await requireAdmin();
  await deleteDietaryProtocol(Number(formData.get("id")));
  revalidatePath("/admin/dietary-protocols");
}
```

Create `app/admin/dietary-protocols/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { listDietaryProtocols } from "@/lib/dietary-protocols";
import PageHeader from "@/components/PageHeader";
import { addDietaryProtocolAction, updateDietaryProtocolAction, deleteDietaryProtocolAction } from "@/app/admin/dietary-protocols/actions";

export default async function DietaryProtocolsPage() {
  await requireAdmin();
  const protocols = await listDietaryProtocols();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Practice settings"
        title="Dietary protocols"
        subtitle="Named eating plans you can drop into a client's Dietary recommendations in one click, then tailor."
      />

      <div className="card">
        <form action={addDietaryProtocolAction} className="stack" style={{ gap: 8 }}>
          <input name="name" placeholder="Name, e.g. Low-FODMAP" required />
          <textarea name="body" rows={5} placeholder="The dietary recommendations as they should appear on the plan…" required />
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Add dietary protocol</button>
        </form>
      </div>

      {protocols.length === 0 ? (
        <div className="card"><p className="muted">No dietary protocols yet.</p></div>
      ) : protocols.map((p) => (
        <div key={p.id} className="card stack" style={{ gap: 8 }}>
          <form action={updateDietaryProtocolAction} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="id" value={p.id} />
            <input name="name" defaultValue={p.name} required />
            <textarea name="body" rows={5} defaultValue={p.body} required />
            <button type="submit" className="btn--sm" style={{ justifySelf: "start" }}>Save</button>
          </form>
          <form action={deleteDietaryProtocolAction}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn--sm">Remove</button>
          </form>
        </div>
      ))}
    </div>
  );
}
```

In `components/AppShell.tsx`, add after the Dosing presets entry:

```ts
      { href: "/admin/dietary-protocols", label: "Dietary protocols", icon: "layers" },
```

- [ ] **Step 6: Template dropdown on the Prepare page**

In `components/SnippetTextarea.tsx`:
- add `import { mergeSection } from "@/lib/text-merge";`
- change the props to:

```tsx
export default function SnippetTextarea({
  name, defaultValue, snippets, rows = 6, placeholder, blocks, blocksLabel,
}: {
  name: string;
  defaultValue?: string;
  snippets: Snippet[];
  rows?: number;
  placeholder?: string;
  blocks?: { id: number; name: string; body: string }[];
  blocksLabel?: string;
}) {
```

- inside the returned `<div>`, insert before the `<textarea …>`:

```tsx
      {blocks && blocks.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const b = blocks.find((x) => String(x.id) === e.target.value);
            if (b) setVal((v) => mergeSection(v, b.body));
          }}
          aria-label={blocksLabel ?? "Insert a template"}
          style={{ marginBottom: 8 }}
        >
          <option value="">{blocksLabel ?? "Insert a template…"}</option>
          {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
```

In `app/plan/[patientId]/prepare/page.tsx`:
- add `import { listDietaryProtocols } from "@/lib/dietary-protocols";`
- change the first load to `const [patient, planId, allSnips, dietaryProtocols] = await Promise.all([` and add `    listDietaryProtocols(),` as the last array entry;
- change the dietary textarea to:

```tsx
              <SnippetTextarea name="dietary" defaultValue={guide.dietary ?? ""} snippets={dietarySnips} rows={4} blocks={dietaryProtocols} blocksLabel="Insert a dietary protocol…" />
```

- [ ] **Step 7: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add lib/schema.sql lib/dietary-protocols.ts app/admin/dietary-protocols components/AppShell.tsx components/SnippetTextarea.tsx "app/plan/[patientId]/prepare/page.tsx" test/dietary-protocols.test.ts
git commit -F - <<'EOF'
Admin: reusable dietary protocols

New Admin → Dietary protocols page for named eating plans. On the Prepare page, an
"Insert a dietary protocol…" dropdown adds one to the Dietary recommendations
(appending under anything already written), ready to tailor.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Deploy Workstream C and verify on the live app**

Ask the user for the go-ahead, then `git push origin main`, wait for `● Ready`, and confirm `migrations applied` in the build log.
Verify in the browser pane (lorna123):
1. Sidebar shows "Dosing presets" and "Dietary protocols".
2. `/admin/dosing`: add `ZZ verify` / `1 capsule at noon`, edit its wording, remove it — it disappears from the list and from a plan item's Dosing preset dropdown.
3. `/catalog/brands`: any brand that had a promo code now shows it as a code marked "default". Add `ZZTEST` to one brand, make it default, then on a plan item of that brand the Order code dropdown shows "Brand default (ZZTEST)", the brand's codes and "No code". Remove `ZZTEST` afterwards and restore the original default.
4. `/admin/dietary-protocols`: add `ZZ verify diet` with two lines; on a test patient's Prepare page, pick it from "Insert a dietary protocol…" and confirm it appends. Delete the template afterwards.

---

## Workstream D — Word download

### Task 9: Word renderer and the snapshot remembers its letterhead

**Files:**
- Modify: `package.json` / `package-lock.json` (via npm), `lib/delivery.ts`
- Create: `lib/docx.ts`, `test/docx.test.ts`
- Test: `test/delivery.test.ts`

**Interfaces:**
- Consumes: `formatConsultationDate` (Task 1), `getLetterheadTheme` (`@/lib/pdf-themes`), `HEADER_IMAGE`/`FOOTER_IMAGE` (`@/lib/pdf-assets`), `GuidePdfData` (`@/lib/pdf`).
- Produces: `renderPlanDocx(data: GuidePdfData, templateId?: string | null): Promise<Buffer>` from `@/lib/docx`; `getSnapshotFrozen(snapshotId: number): Promise<{ data: GuidePdfData; letterheadTemplate: string | null | undefined } | null>` from `@/lib/delivery` (`undefined` = snapshot made before letterheads were recorded).

- [ ] **Step 1: Install the packages**

Run: `npm install --save-exact docx@9.7.2 && npm install --save-dev --save-exact jszip@3.10.1`
Expected: both added to `package.json` with exact versions.

- [ ] **Step 2: Write the failing tests**

Create `test/docx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderPlanDocx } from "@/lib/docx";
import type { GuidePdfData } from "@/lib/pdf";

const data: GuidePdfData = {
  clientName: "Emma Hartley", consultationDate: "2026-08-26",
  intro: "Hi Emma.", nextConsultation: "", lifestyle: "Sleep well.\nWalk daily.", dietary: "",
  supplements: [
    { name: "Food-Grown Magnesium", brand: "Wild Nutrition", size: "60 capsules", dose: "1 capsule at night", duration: "for 3 months", note: "with food", code: "WN10", buyLinks: [{ label: "Wild Nutrition", url: "https://wn.example/mag" }] },
    { name: "Iron Plus", brand: "Cytoplan", size: "", dose: "", duration: "See notes below", note: "", code: "", buyLinks: [] },
  ],
  medsText: "- Levothyroxine 50mcg", notes: "Reach out any time.",
};

async function parts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const read = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  const headerNames = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n));
  const header = (await Promise.all(headerNames.map(read))).join("");
  return { doc: await read("word/document.xml"), header };
}

describe("renderPlanDocx", () => {
  it("produces a .docx with the plan's content in the PDF's order", async () => {
    const buf = await renderPlanDocx(data, "original");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const { doc } = await parts(buf);
    expect(doc).toContain("Emma Hartley");
    expect(doc).toContain("26 August 2026");
    expect(doc).not.toContain("2026-08-26");
    const order = ["LIFESTYLE &amp; OTHER RECOMMENDATIONS", "SUPPLEMENT PLAN", "MEDICATIONS / HORMONES / CONTRACEPTION", "NOTES"].map((h) => doc.indexOf(h));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(doc).not.toContain("DIETARY RECOMMENDATIONS"); // empty sections are left out
    expect(doc).toContain("Food-Grown Magnesium");
    expect(doc).toContain("Iron Plus");
    expect(doc).toContain("See notes below");
    expect(doc).toContain("Code: WN10");
    expect(doc).toContain("Buy at Wild Nutrition");
  });

  it("shades the header with the theme background, and not for the original theme", async () => {
    const { header: slate } = await parts(await renderPlanDocx(data, "slate-blue"));
    expect(slate).toContain('w:fill="E7EDF3"');
    const { header: plain } = await parts(await renderPlanDocx(data, "original"));
    expect(plain).not.toContain("w:fill=");
    expect(plain).toContain("<w:drawing>"); // the banner image is still there
  });
});
```

In `test/delivery.test.ts`: add `finalisePlanToSnapshot, getSnapshotFrozen` to the `@/lib/delivery` import, add `import { getClinicSettings, saveClinicSettings } from "@/lib/settings";` and `import { execute } from "@/lib/db";`, then add inside the `describe("delivery", …)` block:

```ts
  it("records the frozen plan data and the letterhead it was made with", async () => {
    const before = await getClinicSettings();
    await saveClinicSettings({ ...before, letterhead_template: "warm-sand" });
    try {
      const brandId = await createBrand({ name: `Frozen ${Date.now()}` });
      const productId = await createProduct({ brandId, name: "Frozen Magnesium", form: "capsule" });
      const planId = await getOrCreateDraftPlan(await createPatient({ name: "Frozen P", dob: "1990-01-01" }));
      await addPlanItem(planId, productId);
      const { snapshotId } = await finalisePlanToSnapshot({ planId });

      const frozen = (await getSnapshotFrozen(snapshotId))!;
      expect(frozen.data.clientName).toBe("Frozen P");
      expect(frozen.data.supplements.map((r) => r.name)).toEqual(["Frozen Magnesium"]);
      expect(frozen.letterheadTemplate).toBe("warm-sand");
      expect("letterheadTemplate" in frozen.data).toBe(false);
    } finally {
      await saveClinicSettings(before);
    }
  });

  it("returns null for a missing or unreadable snapshot", async () => {
    expect(await getSnapshotFrozen(999999)).toBeNull();
    const planId = await getOrCreateDraftPlan(await createPatient({ name: "Empty Frozen P", dob: "1990-01-01" }));
    const rs = await execute("INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64) VALUES (?, '{}', '')", [planId]);
    expect(await getSnapshotFrozen(Number(rs.lastInsertRowid))).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/docx.test.ts test/delivery.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/docx"`, and delivery fails on the missing `getSnapshotFrozen` export.

- [ ] **Step 4: Store the letterhead and read frozen data back**

In `lib/delivery.ts`, change the PDF import to `import { buildGuidePdfData, renderPlanPdf, type GuidePdfData } from "@/lib/pdf";`. In `finalisePlanToSnapshot`, change the snapshot insert's second argument from `JSON.stringify(pdfData)` to:

```ts
JSON.stringify({ ...pdfData, letterheadTemplate: settings.letterhead_template ?? null })
```

and add at the end of the file:

```ts
// The data a finalised plan was rendered from, plus the letterhead it used. The
// letterhead is `undefined` on snapshots finalised before it was recorded.
export async function getSnapshotFrozen(snapshotId: number): Promise<{ data: GuidePdfData; letterheadTemplate: string | null | undefined } | null> {
  const rows = await query<{ frozen_json: string }>("SELECT frozen_json FROM plan_snapshots WHERE id = ?", [snapshotId]);
  if (!rows[0]) return null;
  let parsed: (GuidePdfData & { letterheadTemplate?: string | null }) | null;
  try { parsed = JSON.parse(rows[0].frozen_json); } catch { return null; }
  if (!parsed || typeof parsed.clientName !== "string") return null;
  const { letterheadTemplate, ...data } = parsed;
  return { data: { ...data, supplements: data.supplements ?? [] }, letterheadTemplate };
}
```

- [ ] **Step 5: Implement the Word renderer**

Create `lib/docx.ts`:

```ts
import {
  BorderStyle, Document, ExternalHyperlink, Footer, Header, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { GuidePdfData } from "@/lib/pdf";
import { HEADER_IMAGE, FOOTER_IMAGE } from "@/lib/pdf-assets";
import { getLetterheadTheme } from "@/lib/pdf-themes";
import { formatConsultationDate } from "@/lib/format";

// Word version of the Supplement Instruction Guide: same content, order and colours as
// the PDF (lib/pdf.tsx), built natively so Lorna can make final edits in Word. The
// letterhead banners sit in Word's real header and footer, on the themed background.

const GOLD = "A17C3A";
const INK = "2C2C2A";
const MUTED = "6B6B63";
const RULE = "E3D9C6";
const FONT = "Merriweather";

// Banner PNGs are 1300 px wide; shown at the content width of A4 with 0.61" margins.
const BANNER_W = 676;
const HEADER_H = Math.round((BANNER_W * 428) / 1300);
const FOOTER_H = Math.round((BANNER_W * 429) / 1300);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_CELL_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const NO_TABLE_BORDERS = { ...NO_CELL_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

const pngFromDataUri = (uri: string) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");

const run = (text: string, opts: { color?: string; size?: number; bold?: boolean } = {}) =>
  new TextRun({ text, font: FONT, color: opts.color ?? INK, size: opts.size ?? 22, bold: opts.bold });

// The banner image, on a full-width shaded cell when the theme has a background.
function banner(uri: string, height: number, bg: string | null): (Paragraph | Table)[] {
  const image = new Paragraph({
    children: [new ImageRun({ type: "png", data: pngFromDataUri(uri), transformation: { width: BANNER_W, height } })],
  });
  if (!bg) return [image];
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_TABLE_BORDERS,
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, color: "auto", fill: bg.replace("#", "") },
      borders: NO_CELL_BORDERS,
      children: [image],
    })] })],
  })];
}

// One paragraph per line; blank lines become empty spacer paragraphs (as in the PDF).
const lines = (text: string) =>
  text.split("\n").map((ln) => new Paragraph({ children: ln.trim() ? [run(ln)] : [], spacing: { after: 40 } }));

const heading = (title: string) =>
  new Paragraph({ children: [run(title.toUpperCase(), { color: GOLD, size: 24 })], spacing: { before: 280, after: 100 } });

const section = (title: string, body: string) => (body.trim() ? [heading(title), ...lines(body)] : []);

const meta = (label: string, value: string) =>
  new Paragraph({ children: [run(`${label}  `, { color: GOLD }), run(value)], spacing: { after: 40 } });

const small = (t: string) => new Paragraph({ children: [run(t, { color: MUTED, size: 17 })] });

const underline = (color: string, size: number) => ({
  top: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  bottom: { style: BorderStyle.SINGLE, size, color },
});

function supplementTable(rows: GuidePdfData["supplements"]): (Paragraph | Table)[] {
  if (rows.length === 0) return [];
  const headCell = (t: string, pct: number) => new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    borders: underline(GOLD, 6),
    children: [new Paragraph({ children: [run(t.toUpperCase(), { color: GOLD, size: 17 })] })],
  });
  const body = rows.map((r) => {
    const brandSize = [r.brand, r.size].filter(Boolean).join("  ·  ");
    const dose = [new Paragraph({ children: [run(r.dose || "—", { size: 21 })] })];
    if (r.duration) dose.push(small(r.duration));
    if (r.note) dose.push(small(r.note));
    const buy = r.buyLinks.length === 0 ? [small("—")] : r.buyLinks.map((b) => new Paragraph({
      children: [new ExternalHyperlink({
        link: b.url,
        children: [new TextRun({ text: b.label ? `Buy at ${b.label}` : "Buy online", font: FONT, size: 18, color: GOLD, underline: {} })],
      })],
    }));
    if (r.code) buy.push(new Paragraph({ children: [run(`Code: ${r.code}`, { size: 17 })] }));
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: 37, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4),
          children: [new Paragraph({ children: [run(r.name, { bold: true })] }), ...(brandSize ? [small(brandSize)] : [])] }),
        new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4), children: dose }),
        new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4), children: buy }),
      ],
    });
  });
  return [
    heading("Supplement Plan"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({ tableHeader: true, children: [headCell("Supplement", 37), headCell("Dosage", 33), headCell("Where to buy", 30)] }),
        ...body,
      ],
    }),
  ];
}

export async function renderPlanDocx(data: GuidePdfData, templateId?: string | null): Promise<Buffer> {
  const bg = getLetterheadTheme(templateId).bg;
  const date = formatConsultationDate(data.consultationDate);
  const children: (Paragraph | Table)[] = [
    meta("Name of client:", data.clientName),
    ...(date ? [meta("Date of consultation:", date)] : []),
    new Paragraph({ children: [] }),
    ...(data.intro ? lines(data.intro) : []),
    ...(data.nextConsultation ? lines(data.nextConsultation) : []),
    ...section("Lifestyle & Other Recommendations", data.lifestyle),
    ...section("Dietary Recommendations", data.dietary),
    ...supplementTable(data.supplements),
    ...section("Medications / Hormones / Contraception", data.medsText),
    ...section("Notes", data.notes),
  ];
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 3900, bottom: 3900, left: 880, right: 880, header: 360, footer: 360 } } },
      headers: { default: new Header({ children: banner(HEADER_IMAGE, HEADER_H, bg) }) },
      footers: { default: new Footer({ children: banner(FOOTER_IMAGE, FOOTER_H, bg) }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/docx.test.ts test/delivery.test.ts`
Expected: PASS. If a `docx` option name is rejected by TypeScript or at runtime, check the type definitions in `node_modules/docx/dist/index.d.ts` for the exact property name and adjust — do not change the test expectations.

- [ ] **Step 7: Eyeball a rendered Word file**

Create a throwaway `test/_sample-docx.test.ts` (vitest resolves the `@/` paths; plain `tsx` is unreliable here):

```ts
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPlanDocx } from "@/lib/docx";

it("writes sample Word files", async () => {
  const out = process.env.SAMPLE_OUT || ".";
  const d = {
    clientName: "Sample Client", consultationDate: "2026-08-26", intro: "Hello.", nextConsultation: "",
    lifestyle: "Sleep well.", dietary: "Eat greens.", medsText: "", notes: "Thanks.",
    supplements: [{ name: "Food-Grown Magnesium", brand: "Wild Nutrition", size: "60 capsules", dose: "1 capsule at night", duration: "for 3 months", note: "", code: "WN10", buyLinks: [{ label: "Wild Nutrition", url: "https://www.wildnutrition.com/" }] }],
  };
  writeFileSync(join(out, "sample-original.docx"), await renderPlanDocx(d, "original"));
  writeFileSync(join(out, "sample-slate.docx"), await renderPlanDocx(d, "slate-blue"));
});
```

Run (with `SCRATCH` set to the session scratchpad directory):

```bash
SAMPLE_OUT="$SCRATCH" npx vitest run test/_sample-docx.test.ts && qlmanage -t -s 1100 -o "$SCRATCH" "$SCRATCH/sample-slate.docx" "$SCRATCH/sample-original.docx" && rm test/_sample-docx.test.ts
```

Expected: PNG previews in the scratchpad — the logo banner on a soft blue header (slate) and on white (original), gold headings, and the supplement table. Look at both before moving on; send them to the user.

- [ ] **Step 8: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add package.json package-lock.json lib/docx.ts lib/delivery.ts test/docx.test.ts test/delivery.test.ts
git commit -F - <<'EOF'
Plans: Word version of the guide, matching the PDF

Adds renderPlanDocx (docx 9.7.2): the same content, order and gold styling as the
PDF, with the letterhead banners in Word's header and footer on the chosen
background. Finalised snapshots now record which letterhead they were made with.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 10: Word download route + History button + deploy Workstream D

**Files:**
- Create: `app/api/snapshots/[id]/docx/route.ts`, `test/docx-route.test.ts`
- Modify: `app/patients/[id]/history/page.tsx`

**Interfaces:**
- Consumes: `getSnapshotFrozen` and `renderPlanDocx` (Task 9), `getClinicSettings` (`@/lib/settings`), `getCurrentUser` (`@/lib/auth/current-user`).
- Produces: `GET /api/snapshots/:id/docx` (`?download=1` → attachment `supplement-plan-<id>.docx`).

- [ ] **Step 1: Write the failing test**

Create `test/docx-route.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { userId: number; role: string } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => auth.user }));

import { runMigrations } from "@/scripts/migrate";
import { execute } from "@/lib/db";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan } from "@/lib/plans";
import { GET } from "@/app/api/snapshots/[id]/docx/route";

describe("GET /api/snapshots/[id]/docx", () => {
  let snapId = 0;
  beforeAll(async () => {
    await runMigrations();
    const planId = await getOrCreateDraftPlan(await createPatient({ name: "Docx Route P", dob: "1990-01-01" }));
    const frozen = {
      clientName: "Docx Route P", consultationDate: "2026-08-26", intro: "", nextConsultation: "",
      lifestyle: "", dietary: "", supplements: [], medsText: "", notes: "", letterheadTemplate: "sage-green",
    };
    const rs = await execute("INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64) VALUES (?, ?, '')", [planId, JSON.stringify(frozen)]);
    snapId = Number(rs.lastInsertRowid);
  });

  const call = (id: number, qs = "") =>
    GET(new Request(`http://test/api/snapshots/${id}/docx${qs}`), { params: { id: String(id) } });

  it("401 without a session", async () => {
    auth.user = null;
    expect((await call(snapId)).status).toBe(401);
  });

  it("404 for an unknown snapshot", async () => {
    auth.user = { userId: 1, role: "admin" };
    expect((await call(999999)).status).toBe(404);
  });

  it("returns a Word download for a finalised plan", async () => {
    auth.user = { userId: 1, role: "admin" };
    const res = await call(snapId, "?download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="supplement-plan-${snapId}.docx"`);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/docx-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/snapshots/[id]/docx/route"`.

- [ ] **Step 3: Implement the route**

Create `app/api/snapshots/[id]/docx/route.ts`:

```ts
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSnapshotFrozen } from "@/lib/delivery";
import { getClinicSettings } from "@/lib/settings";
import { renderPlanDocx } from "@/lib/docx";

// Word version of a finalised plan, generated on demand from the snapshot's frozen
// data so it always matches the PDF that was made.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const frozen = await getSnapshotFrozen(Number(params.id));
  if (!frozen) return new Response("Not found", { status: 404 });
  // The letterhead the plan was finalised with; older snapshots use today's setting.
  const template = frozen.letterheadTemplate !== undefined
    ? frozen.letterheadTemplate
    : (await getClinicSettings()).letterhead_template;
  const docx = await renderPlanDocx(frozen.data, template);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(docx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="supplement-plan-${params.id}.docx"`,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/docx-route.test.ts`
Expected: PASS.

- [ ] **Step 5: History button**

In `app/patients/[id]/history/page.tsx`, directly after the "Download PDF" link add:

```tsx
                  <a href={`/api/snapshots/${s.id}/docx?download=1`} className="btn btn--sm">Download Word</a>
```

- [ ] **Step 6: Typecheck, full suite, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no tsc output; all pass.

```bash
git add "app/api/snapshots/[id]/docx/route.ts" "app/patients/[id]/history/page.tsx" test/docx-route.test.ts
git commit -F - <<'EOF'
History: "Download Word" for every finalised plan

Adds /api/snapshots/:id/docx (signed-in staff only) and a Download Word button
beside Download PDF. The Word file is built from the same frozen data as the PDF,
on the letterhead the plan was finalised with.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Deploy Workstream D and verify on the live app**

Ask the user for the go-ahead, then `git push origin main` and wait for `● Ready`.
Verify in the browser pane (lorna123):
1. A patient's History shows "Download Word" beside "Download PDF".
2. In the page, run `const r = await fetch('/api/snapshots/<id>/docx?download=1'); [r.status, r.headers.get('content-type'), new Uint8Array(await r.arrayBuffer()).slice(0,2)]` for a real snapshot id → `200`, the wordprocessingml type, bytes `80,75` ("PK").
3. Signed out (or in a fresh tab without the session), the same URL returns 401.
Tell the user: Word shows Merriweather only where it's installed — Lorna should install the free Merriweather font once (fonts.google.com/specimen/Merriweather), otherwise Word substitutes a similar serif.

---

## Wrap-up

- [ ] Update `/Users/utkarshrawat/.claude/projects/-Users-utkarshrawat-Wild-Dash/memory/supplement-selection-db-project.md` with what shipped (commits, the order-code null/""/code rule, presets archive, brand_codes migration, Word export) and keep the index line in `MEMORY.md` current.
- [ ] Send the user a short "where to find things" note for Lorna: Admin → Dosing presets; Admin → Dietary protocols; Catalog → Brands (codes); Catalog → Add product and "Remove from catalogue" (item 6, already existed); History → Download Word; install Merriweather.
