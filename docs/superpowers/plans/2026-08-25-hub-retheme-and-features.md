# Supplement Selection Database — Plan 5: Hub Re-theme + Dashboard + Protocols

> Mixed gating: the re-theme (Tasks 1–3) is visual — gate on browser screenshots + green tests + clean build. Protocols (Tasks 4–6) and Dashboard (Task 7) touch data — TDD where there's logic. The 41 existing tests MUST stay green.

**Goal:** Re-skin the whole app to match the Wild Nutrition Practitioner Hub deck — a warm, premium, editorial look (deep-navy left sidebar, cream canvas, sand cards, serif display headings, terracotta + sage accents) — kept as the clinic's OWN brand (sidebar shows the clinic name from Settings). Then add two advanced features: a personal Dashboard home, and reusable Protocols (save a plan as a named protocol, apply it to any patient with flagging).

**Approach:** Replace the top-nav shell with a sidebar shell. Rewrite the global design system (tokens, fonts, component classes) so every screen inherits the new look; then adjust the hero screens for the sand-card + serif treatment. Protocols get a small data layer + screens; the Dashboard aggregates counts and recents.

**Design system (from the deck):**
- Fonts: **Fraunces** (serif display — headings, editorial), **Inter** (sans — body/UI). Both `next/font/google`.
- Palette:
  - `--navy` #10243A · `--navy-2` #0B1B2C (sidebar) · `--navy-ink` #1F2D38 (text)
  - `--cream` #FAF5EE (canvas) · `--sand` #F3EBDF (cards) · `--sand-2` #EFE6D6 · `--sand-border` #E7DDCD
  - `--terracotta` #C06A47 · `--terracotta-tint` #F3E3DA
  - `--sage` #8DA06A · `--sage-tint` #EBEFE1
  - `--ink-2` #5C6B73 · `--ink-muted` #8A968F
  - Semantic kept: danger #B42318/#FEF3F2, warn #B54708/#FFFAEB, ok #067647/#ECFDF3
- Radius: 14px cards, 10px controls, pill search. Buttons: navy fill, white text, rounded.

**Tech Stack:** Next.js 14, `next/font/google` (Fraunces + Inter). No other new deps.

## Global Constraints

- Presentation changes must not alter `lib/*` behaviour — keep all 41 tests green (`npx vitest run`). Protocols/Dashboard add NEW code + tests.
- Keep the clinic-owned framing: NO hard-coded "Wild Nutrition"; sidebar brand = clinic name from `getClinicSettings()` (fallback "Supplement plans").
- Sentence case, no exclamation marks (except the deck-style friendly greeting on the dashboard, which may use a waving hand emoji).
- Accessibility: focus rings, contrast (white on navy passes; navy on cream passes), labelled controls.
- Dev server: preview `supplement-db-dev` (3200). After adding fonts/new components, `rm -rf .next` before restart (stale-cache 404s).
- Protocols reuse the existing flagging engine — applying a protocol to a patient must surface the same blocks in the plan builder.

---

### Task 1: Re-theme design tokens + fonts

**Files:** Modify `app/globals.css` (new token palette + serif/sans wiring + component classes), `app/layout.tsx` (load Fraunces + Inter).

**Deliverable:** the whole app adopts the cream canvas, sand cards, serif headings, and navy controls via globals — before any per-screen work.

- [ ] **Step 1: Fonts in `app/layout.tsx`**
```tsx
import { Fraunces, Inter } from "next/font/google";
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-serif" });
const inter = Inter({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-sans" });
```
Apply `className={`${fraunces.variable} ${inter.variable}`}` on `<html>`.

- [ ] **Step 2: Rewrite `app/globals.css`** with the palette above. `body` background `var(--cream)`, font Inter. Headings use `font-family: var(--font-serif)`, weight 500, letter-spacing normal, color `var(--navy-ink)`; h1 30px, h2 20px. Controls: white bg, `1px solid var(--sand-border)`, radius 10px, focus ring `0 0 0 3px var(--terracotta-tint)`. `.btn--primary` = navy fill/white text. Cards: `.card` = `var(--sand)` bg, `1px solid var(--sand-border)`, radius 14px, subtle shadow. Add `.eyebrow` (uppercase 11px terracotta letter-spaced label), `.badge` variants recoloured onto sand, `.serif` helper. `.page` max-width 960, padding.

- [ ] **Step 3:** Verify — screenshot `/catalog` after restart; confirm cream canvas, serif headings, sand cards, navy buttons. `npx vitest run` still 41/41.
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): re-theme tokens, Fraunces+Inter, sand/navy design system"`

---

### Task 2: Sidebar shell

**Files:** Rewrite `components/AppShell.tsx`; modify `components/SignOutButton.tsx` (navy-appropriate styling). Create `components/SidebarNav.tsx` (client, for active-route highlight).

**Deliverable:** a fixed deep-navy left sidebar (clinic wordmark, nav items with icons, sign-out) + cream content area — matching the deck. Login stays chrome-free.

- [ ] **Step 1:** `AppShell` (server) reads `getCurrentUser()` + `getClinicSettings()`. If no user → bare children. Else render a flex layout: a 240px fixed navy sidebar (`--navy-2`) with the clinic name at top (serif), nav links (Dashboard, Patients, Catalog, and for admin: Taxonomies, Team, Settings) each with a small inline SVG/emoji-free icon glyph and white/rgba text, active item highlighted with a subtle `rgba(255,255,255,0.08)` pill + terracotta left accent; a "Signed in as {name}" + sign-out at the bottom; and a `<main>` with `.page` on the cream canvas. Mobile: sidebar collapses to a top bar (simple: horizontal scroll nav) under `@media (max-width: 760px)` via a CSS class.
- [ ] **Step 2:** `SidebarNav` client component highlights the active route via `usePathname()`.
- [ ] **Step 3:** Verify — screenshot a signed-in page showing the navy sidebar; confirm `/login` has none.
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): navy sidebar shell with clinic branding"`

---

### Task 3: Re-skin hero screens to the editorial card style

**Files:** Modify `app/login/page.tsx`, `app/catalog/page.tsx`, `components/ProductSearch.tsx`, `app/plan/[patientId]/page.tsx`, `app/patients/page.tsx`, `app/patients/[id]/page.tsx`, `app/catalog/products/[id]/page.tsx`.

**Deliverable:** hero screens use eyebrow labels, serif titles, sand cards, and navy CTAs — the deck's card grammar. Login becomes a warm centered card on cream with the serif wordmark.

- [ ] **Step 1:** Apply `.eyebrow` + serif `h1/h2`, convert result/list rows and item cards to the sand style, primary actions to `.btn--primary` (navy). The plan builder suggestion panel uses `--sage-tint`; blocks stay danger-red; allergy/caution chips use the semantic badges. Screenshot the plan builder (block + clean states) and catalog.
- [ ] **Step 2:** `npx vitest run` still 41/41. **Commit** — `git commit -m "feat(ui): editorial re-skin of hero screens"`

---

### Task 4: Protocols data layer

**Files:** Create `lib/protocols.ts`; append `protocols` + `protocol_items` tables to `lib/schema.sql`. Test: `test/protocols.test.ts`.

**Schema (append to `lib/schema.sql`):**
```sql
CREATE TABLE IF NOT EXISTS protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS protocol_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  dosing_preset_id INTEGER REFERENCES dosing_presets(id),
  dosing_custom_text TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
```

**Interfaces (produce):**
- `type ProtocolSummary = { id: number; name: string; description: string|null; itemCount: number }`
- `savePlanAsProtocol(planId: number, name: string, description: string|null, createdBy?: number): Promise<number>` — copies the plan's items (product + dosing) into a new protocol.
- `listProtocols(): Promise<ProtocolSummary[]>`
- `getProtocol(id: number): Promise<{ id: number; name: string; description: string|null; items: { productId: number; productName: string; dosingText: string }[] } | null>`
- `applyProtocolToPlan(protocolId: number, planId: number): Promise<number>` — appends the protocol's items (with dosing) to the plan; returns count added. Reuses `addPlanItem` + `setItemDosing`.
- `deleteProtocol(id: number): Promise<void>`

- [ ] **Step 1: Write `test/protocols.test.ts`** — create brand/product/dosing/patient/plan; add 2 items with dosing; `savePlanAsProtocol`; assert `getProtocol` returns 2 items with dosing text; `applyProtocolToPlan` to a fresh plan adds 2 items whose `getPlan` dosing matches. (Full test code written at execution.)
- [ ] **Step 2:** Run — FAIL (module missing).
- [ ] **Step 3: Write `lib/protocols.ts`** implementing the interfaces with raw SQL, reusing `addPlanItem`/`setItemDosing`/`dosingTextFor` from `lib/plans.ts`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add protocols data layer (save plan as protocol, apply to plan)"`

---

### Task 5: Protocols screens

**Files:** Create `app/protocols/page.tsx`, `app/protocols/actions.ts`. Modify `app/plan/[patientId]/page.tsx` (add "Save as protocol" + "Apply a protocol"). Add a Protocols link to the sidebar (Task 2's nav list).

**Interfaces:** server actions `saveAsProtocolAction(formData)` (from a plan), `applyProtocolAction(formData)` (to a plan), `deleteProtocolAction(formData)`.

- [ ] **Step 1:** Protocols index — list `ProtocolSummary` as sand cards (name, description, item count) with a delete control.
- [ ] **Step 2:** In the plan builder, add an "Apply a protocol" select (lists protocols) + Apply button; and a "Save this plan as a protocol" form (name + optional description). Both revalidate the plan page. Applying re-runs flagging automatically (existing page logic), so a protocol product that conflicts with the patient's allergy shows the block.
- [ ] **Step 3:** Verify in browser — save a plan as a protocol, apply it to another patient, confirm items appear and flags recompute. `npx vitest run` still green.
- [ ] **Step 4: Commit** — `git commit -m "feat: add protocols screens and plan builder integration"`

---

### Task 6: Dashboard aggregates

**Files:** Create `lib/dashboard.ts`. Test: `test/dashboard.test.ts`.

**Interfaces (produce):**
- `type DashboardStats = { patientCount: number; draftPlans: number; plansSentThisWeek: number; plansSentAllTime: number }`
- `getDashboardStats(): Promise<DashboardStats>` — counts from `patients`, `plans` (status draft), `plan_snapshots` (sent_at within 7 days / all).
- `recentPatients(limit?: number): Promise<{ id: number; name: string; dob: string }[]>` — most recently created.
- `recentlySent(limit?: number): Promise<{ snapshotId: number; patientName: string; sentAt: string|null; email: string|null }[]>` — join snapshots→plans→patients.

- [ ] **Step 1: Write `test/dashboard.test.ts`** — seed a patient + a finalised+sent plan; assert `getDashboardStats` counts patient ≥1, plansSentAllTime ≥1; `recentPatients` includes the patient; `recentlySent` includes the send. (Full code at execution.)
- [ ] **Step 2:** Run — FAIL. **Step 3:** Write `lib/dashboard.ts`. **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add dashboard aggregate queries"`

---

### Task 7: Dashboard home screen

**Files:** Create `app/dashboard/page.tsx`. Modify `app/page.tsx` (redirect `/` → `/dashboard`), `middleware`/nav so signed-in root lands on the dashboard. Make the sidebar "Dashboard" the first nav item.

**Deliverable:** the deck-style personal home: a serif greeting ("Good morning, {name}"), a row of stat cards (patients, drafts, sent this week, sent all-time), a "Recent patients" sand-card list (each linking to the plan), and a "Recently sent" list — with a primary "New patient" action.

- [ ] **Step 1:** `app/dashboard/page.tsx` (server) `requireUser()`, pulls `getDashboardStats`, `recentPatients`, `recentlySent`; renders greeting (time-of-day based), stat cards (sand, big serif number + eyebrow label), and the two lists. Quick actions: New patient, Open catalog.
- [ ] **Step 2:** `app/page.tsx` → `redirect("/dashboard")`. Update login redirect + `SignOutButton`/nav targets already point at `/patients`; change the primary post-login destination to `/dashboard` (login page `router.push("/dashboard")`, AppShell brand link → `/dashboard`).
- [ ] **Step 3:** Verify — screenshot `/dashboard` signed in. `npx vitest run` green, `npm run build` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat: add personal dashboard home"`

---

## Self-Review

- Deck aesthetic (navy sidebar, cream, sand cards, serif display, terracotta/sage) → Tasks 1–3. Kept clinic-owned (brand from settings) per constraint. ✓
- Dashboard home (greeting, stats, recents) → Tasks 6–7. ✓
- Reusable protocols (save from plan, apply to patient, flagging on apply) → Tasks 4–5. ✓
- No `lib/*` behaviour change in re-theme tasks; protocols/dashboard add new tested modules; 41 existing tests stay green. ✓
- Fonts + tokens defined once (Task 1) and consumed everywhere; sidebar nav lists Dashboard/Patients/Catalog/Protocols + admin items consistently (Tasks 2, 5, 7). ✓
- Gate: screenshots for visual tasks, TDD for data tasks, clean build at the end. ✓
