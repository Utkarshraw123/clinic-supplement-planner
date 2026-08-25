# Supplement Selection Database — Plan 2: Clinical Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clinical core on top of the Plan 1 foundation — patient records, an editable supplement plan builder with dosing, deterministic allergy/contraindication flagging, a clinic-branded PDF export, and email delivery — so a practitioner can create, flag-check, finalise, and send a plan end to end.

**Architecture:** Extends the existing Next.js 14 + Turso app. New tables for patients, patient attributes, plans, plan items, plan snapshots, dosing presets, and an audit log. A pure deterministic flagging module (`lib/flagging.ts`) does set-based matching of product tags against patient attributes — no LLM. PDF is generated server-side with `@react-pdf/renderer` (pure JS, serverless-safe — no headless browser). Email uses `resend`, degrading to mock mode (log only) without a key. Every finalise re-checks flags so an allergen conflict can never be sent.

**Tech Stack:** Next.js 14, TypeScript, `@libsql/client`, Vitest, `@react-pdf/renderer`, `resend`.

## Global Constraints

- Extends Plan 1. Do not restructure Plan 1 code. Reuse `lib/db.ts` (`query`/`execute`), `requireUser`/`requireAdmin`, `lib/products.ts`, `lib/taxonomies.ts` (`TermType`).
- Raw parameterised SQL only, no ORM. Every db function is `async`.
- Stored patient identifiers: **Name + DOB only**. Do NOT add address/phone/email columns to `patients`. Client email is captured at send time and stored only on the snapshot's send record (`plan_snapshots.sent_to_email`).
- Flagging is deterministic and set-based. No LLM anywhere in the clinical path.
- Safety is a gate, never a weight: an allergen match is a HARD block; a caution match is a soft warning. A plan with any active hard block cannot be finalised or sent.
- Copy: sentence case, no exclamation marks in system copy.
- External services (email) run in mock mode without keys — the app stays fully exercisable.
- Tests: Vitest, TDD, keep green. Tests already run serially against `file:test.db` (see `test/setup.ts`).
- Dev server: preview name `supplement-db-dev` (port 3200). CLI scripts run via `tsx`.

## Data model additions (spec §4)

| Table | Columns |
|---|---|
| `patients` | id, name, dob, created_at, created_by |
| `patient_attributes` | patient_id→, taxonomy_term_id→, attr_type (`allergy`/`goal`/`diet`/`med_condition`), PK(patient_id, taxonomy_term_id, attr_type) |
| `dosing_presets` | id, label, text |
| `plans` | id, patient_id→, status (`draft`/`finalised`), author_id→, created_at, updated_at |
| `plan_items` | id, plan_id→, product_id→, dosing_preset_id?, dosing_custom_text?, chosen_alternative_id?, position |
| `plan_snapshots` | id, plan_id→, frozen_json, pdf_base64, sent_to_email?, sent_at?, sent_by?, created_at |
| `audit_events` | id, actor_id→, action, entity, entity_id, detail, created_at |

`clinic_settings` already exists (Plan 1). PDF stored as base64 text on the snapshot (Turso has no blob-friendly file store; base64 keeps it self-contained and small for a handful of items).

---

### Task 1: Schema additions + dosing preset seed

**Files:**
- Modify: `lib/schema.sql` (append new tables)
- Create: `scripts/seed-dosing.ts`
- Test: `test/schema-clinical.test.ts`

**Interfaces:**
- Consumes: `runMigrations` (`scripts/migrate.ts`), `execute`/`query` (`lib/db.ts`).
- Produces: tables `patients`, `patient_attributes`, `dosing_presets`, `plans`, `plan_items`, `plan_snapshots`, `audit_events`; a seed of standard dosing presets.

- [ ] **Step 1: Append tables to `lib/schema.sql`**

Append (do not remove existing statements):
```sql
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dob TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS patient_attributes (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  taxonomy_term_id INTEGER NOT NULL REFERENCES taxonomy_terms(id),
  attr_type TEXT NOT NULL CHECK (attr_type IN ('allergy','goal','diet','med_condition')),
  PRIMARY KEY (patient_id, taxonomy_term_id, attr_type)
);

CREATE TABLE IF NOT EXISTS dosing_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised')),
  author_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  dosing_preset_id INTEGER REFERENCES dosing_presets(id),
  dosing_custom_text TEXT,
  chosen_alternative_id INTEGER REFERENCES products(id),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plan_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  frozen_json TEXT NOT NULL,
  pdf_base64 TEXT NOT NULL,
  sent_to_email TEXT,
  sent_at TEXT,
  sent_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Write `scripts/seed-dosing.ts`**

```ts
import { runMigrations } from "@/scripts/migrate";
import { query, execute } from "@/lib/db";

const PRESETS = [
  { label: "1 capsule with breakfast", text: "Take 1 capsule with breakfast." },
  { label: "2 capsules with food", text: "Take 2 capsules with food." },
  { label: "1 capsule with evening meal", text: "Take 1 capsule with your evening meal." },
  { label: "1 teaspoon daily", text: "Take 1 teaspoon daily." },
  { label: "As directed", text: "Take as directed by your practitioner." },
];

async function main() {
  await runMigrations();
  for (const p of PRESETS) {
    const existing = await query<{ id: number }>("SELECT id FROM dosing_presets WHERE label = ?", [p.label]);
    if (existing.length === 0) await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [p.label, p.text]);
  }
  console.log("dosing presets seeded");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Write the failing test**

`test/schema-clinical.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { query } from "@/lib/db";

describe("clinical schema", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates all clinical tables", async () => {
    const rows = await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    const names = rows.map((r) => r.name);
    for (const t of ["patients","patient_attributes","dosing_presets","plans","plan_items","plan_snapshots","audit_events"]) {
      expect(names).toContain(t);
    }
  });
});
```

- [ ] **Step 4: Run test**

Run: `npx vitest run test/schema-clinical.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add clinical schema (patients, plans, snapshots, audit) and dosing seed"
```

---

### Task 2: Audit log helper

**Files:**
- Create: `lib/audit.ts`
- Test: `test/audit.test.ts`

**Interfaces:**
- Consumes: `execute`, `query`.
- Produces:
  - `recordAudit(input: { actorId?: number; action: string; entity: string; entityId?: number; detail?: string }): Promise<void>`
  - `listAuditForEntity(entity: string, entityId: number): Promise<{ action: string; detail: string|null; created_at: string; actor_id: number|null }[]>`

- [ ] **Step 1: Write `lib/audit.ts`**

```ts
import { execute, query } from "@/lib/db";

export async function recordAudit(input: { actorId?: number; action: string; entity: string; entityId?: number; detail?: string }): Promise<void> {
  await execute(
    "INSERT INTO audit_events (actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)",
    [input.actorId ?? null, input.action, input.entity, input.entityId ?? null, input.detail ?? null]
  );
}

export async function listAuditForEntity(entity: string, entityId: number): Promise<{ action: string; detail: string|null; created_at: string; actor_id: number|null }[]> {
  return query(
    "SELECT action, detail, created_at, actor_id FROM audit_events WHERE entity = ? AND entity_id = ? ORDER BY created_at DESC",
    [entity, entityId]
  );
}
```

- [ ] **Step 2: Write the failing test**

`test/audit.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { recordAudit, listAuditForEntity } from "@/lib/audit";

describe("audit", () => {
  beforeAll(async () => { await runMigrations(); });
  it("records and lists events for an entity", async () => {
    const id = Date.now() % 1000000;
    await recordAudit({ action: "finalised", entity: "plan", entityId: id, detail: "2 items" });
    const events = await listAuditForEntity("plan", id);
    expect(events[0].action).toBe("finalised");
    expect(events[0].detail).toBe("2 items");
  });
});
```

- [ ] **Step 3: Run test, then commit**

Run: `npx vitest run test/audit.test.ts` → PASS.
```bash
git add -A && git commit -m "feat: add audit log helper"
```

---

### Task 3: Patient data layer

**Files:**
- Create: `lib/patients.ts`
- Test: `test/patients.test.ts`

**Interfaces:**
- Consumes: `query`, `execute`; taxonomy terms.
- Produces:
  - `type AttrType = "allergy"|"goal"|"diet"|"med_condition"`
  - `type PatientAttr = { termId: number; label: string; attrType: AttrType }`
  - `type PatientDetail = { id: number; name: string; dob: string; attributes: PatientAttr[] }`
  - `createPatient(input: { name: string; dob: string; createdBy?: number }): Promise<number>`
  - `updatePatientBasics(id: number, input: { name: string; dob: string }): Promise<void>`
  - `listPatients(): Promise<{ id: number; name: string; dob: string }[]>`
  - `getPatient(id: number): Promise<PatientDetail | null>`
  - `setPatientAttributes(patientId: number, attrs: { termId: number; attrType: AttrType }[]): Promise<void>` — replaces all attributes.

- [ ] **Step 1: Write `lib/patients.ts`**

```ts
import { query, execute } from "@/lib/db";

export type AttrType = "allergy"|"goal"|"diet"|"med_condition";
export type PatientAttr = { termId: number; label: string; attrType: AttrType };
export type PatientDetail = { id: number; name: string; dob: string; attributes: PatientAttr[] };

export async function createPatient(input: { name: string; dob: string; createdBy?: number }): Promise<number> {
  const rs = await execute(
    "INSERT INTO patients (name, dob, created_by) VALUES (?, ?, ?)",
    [input.name.trim(), input.dob.trim(), input.createdBy ?? null]
  );
  return Number(rs.lastInsertRowid);
}

export async function updatePatientBasics(id: number, input: { name: string; dob: string }): Promise<void> {
  await execute("UPDATE patients SET name = ?, dob = ? WHERE id = ?", [input.name.trim(), input.dob.trim(), id]);
}

export async function listPatients(): Promise<{ id: number; name: string; dob: string }[]> {
  return query("SELECT id, name, dob FROM patients ORDER BY name");
}

export async function getPatient(id: number): Promise<PatientDetail | null> {
  const base = await query<{ id: number; name: string; dob: string }>("SELECT id, name, dob FROM patients WHERE id = ?", [id]);
  if (!base[0]) return null;
  const attributes = await query<PatientAttr>(
    `SELECT t.id AS termId, t.label AS label, pa.attr_type AS attrType
     FROM patient_attributes pa JOIN taxonomy_terms t ON t.id = pa.taxonomy_term_id
     WHERE pa.patient_id = ?`, [id]
  );
  return { ...base[0], attributes };
}

export async function setPatientAttributes(patientId: number, attrs: { termId: number; attrType: AttrType }[]): Promise<void> {
  await execute("DELETE FROM patient_attributes WHERE patient_id = ?", [patientId]);
  for (const a of attrs) {
    await execute(
      "INSERT OR IGNORE INTO patient_attributes (patient_id, taxonomy_term_id, attr_type) VALUES (?, ?, ?)",
      [patientId, a.termId, a.attrType]
    );
  }
}
```

- [ ] **Step 2: Write the failing test**

`test/patients.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import * as Pt from "@/lib/patients";

describe("patients", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates a patient and replaces attributes", async () => {
    const id = await Pt.createPatient({ name: "Emma Hartley", dob: "1988-03-14" });
    const mushroom = await addTerm("allergen", "mushroom");
    const energy = await addTerm("concern", "energy");
    await Pt.setPatientAttributes(id, [
      { termId: mushroom, attrType: "allergy" },
      { termId: energy, attrType: "goal" },
    ]);
    let detail = await Pt.getPatient(id);
    expect(detail!.name).toBe("Emma Hartley");
    expect(detail!.attributes.map((a) => a.attrType).sort()).toEqual(["allergy","goal"]);

    // replace, not append
    await Pt.setPatientAttributes(id, [{ termId: energy, attrType: "goal" }]);
    detail = await Pt.getPatient(id);
    expect(detail!.attributes).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test, then commit**

Run: `npx vitest run test/patients.test.ts` → PASS.
```bash
git add -A && git commit -m "feat: add patient data layer"
```

---

### Task 4: Flagging engine (safety-critical)

**Files:**
- Create: `lib/flagging.ts`
- Test: `test/flagging.test.ts`

**Interfaces:**
- Consumes: `ProductDetail` (`lib/products.ts`), `PatientAttr` (`lib/patients.ts`).
- Produces:
  - `type Flag = { level: "block"|"warn"; reason: string }`
  - `flagProductForPatient(product: ProductDetail, attributes: PatientAttr[]): Flag[]`
    - HARD block: any product `allergen`/`ingredient` tag label matches (case-insensitive) a patient `allergy` term label.
    - Soft warn: any product `caution` tag label matches a patient `med_condition` term label.
    - Soft warn: patient has a `diet` attribute whose label is NOT present among the product's `diet` tag labels (e.g. patient vegan, product not tagged vegan) — reason `"not tagged {diet}"`. Only warns for diet labels the catalog uses (i.e. only when the product has at least one diet tag); if the product has no diet tags at all, no diet warning (unknown, not unsafe).
  - `hasBlock(flags: Flag[]): boolean`
  - `scoreProductForPatient(product: ProductDetail, attributes: PatientAttr[]): number` — count of product `concern` labels that match patient `goal` labels. (Used by Plan 3; defined here so ranking has a home. Blocked products are excluded by the caller.)

- [ ] **Step 1: Write the failing test**

`test/flagging.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { flagProductForPatient, hasBlock, scoreProductForPatient } from "@/lib/flagging";
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

function product(partial: Partial<ProductDetail>): ProductDetail {
  return {
    id: 1, brand_id: 1, brand_name: "B", name: "P", package_size: null, form: null, status: "active",
    tags: [], suppliers: [], alternatives: [], ...partial,
  };
}

describe("flagging", () => {
  it("hard-blocks when an allergen/ingredient matches a patient allergy", () => {
    const p = product({ tags: [{ termId: 1, label: "mushroom", tagType: "ingredient" }] });
    const attrs: PatientAttr[] = [{ termId: 9, label: "Mushroom", attrType: "allergy" }];
    const flags = flagProductForPatient(p, attrs);
    expect(hasBlock(flags)).toBe(true);
    expect(flags[0].level).toBe("block");
  });

  it("soft-warns when a caution matches a med/condition", () => {
    const p = product({ tags: [{ termId: 2, label: "pregnancy", tagType: "caution" }] });
    const attrs: PatientAttr[] = [{ termId: 8, label: "pregnancy", attrType: "med_condition" }];
    const flags = flagProductForPatient(p, attrs);
    expect(hasBlock(flags)).toBe(false);
    expect(flags[0].level).toBe("warn");
  });

  it("soft-warns on diet mismatch only when the product declares diets", () => {
    const veganPatient: PatientAttr[] = [{ termId: 3, label: "vegan", attrType: "diet" }];
    const declaredNonVegan = product({ tags: [{ termId: 4, label: "vegetarian", tagType: "diet" }] });
    expect(flagProductForPatient(declaredNonVegan, veganPatient).some((f) => f.reason.includes("vegan"))).toBe(true);
    const noDietInfo = product({ tags: [] });
    expect(flagProductForPatient(noDietInfo, veganPatient)).toHaveLength(0);
  });

  it("scores concern/goal overlap and never blocks on score alone", () => {
    const p = product({ tags: [{ termId: 5, label: "energy", tagType: "concern" }, { termId: 6, label: "sleep", tagType: "concern" }] });
    const attrs: PatientAttr[] = [{ termId: 7, label: "energy", attrType: "goal" }];
    expect(scoreProductForPatient(p, attrs)).toBe(1);
  });

  it("returns no flags for a clean product", () => {
    const p = product({ tags: [{ termId: 1, label: "magnesium", tagType: "ingredient" }] });
    const attrs: PatientAttr[] = [{ termId: 9, label: "shellfish", attrType: "allergy" }];
    expect(flagProductForPatient(p, attrs)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/flagging.test.ts`
Expected: FAIL ("flagProductForPatient is not a function").

- [ ] **Step 3: Write `lib/flagging.ts`**

```ts
import type { ProductDetail } from "@/lib/products";
import type { PatientAttr } from "@/lib/patients";

export type Flag = { level: "block"|"warn"; reason: string };

const norm = (s: string) => s.trim().toLowerCase();

export function flagProductForPatient(product: ProductDetail, attributes: PatientAttr[]): Flag[] {
  const flags: Flag[] = [];
  const allergyLabels = new Set(attributes.filter((a) => a.attrType === "allergy").map((a) => norm(a.label)));
  const conditionLabels = new Set(attributes.filter((a) => a.attrType === "med_condition").map((a) => norm(a.label)));
  const dietPrefs = attributes.filter((a) => a.attrType === "diet").map((a) => norm(a.label));

  const productAllergenIngredient = product.tags
    .filter((t) => t.tagType === "allergen" || t.tagType === "ingredient")
    .map((t) => norm(t.label));
  const productCautions = product.tags.filter((t) => t.tagType === "caution").map((t) => norm(t.label));
  const productDiets = product.tags.filter((t) => t.tagType === "diet").map((t) => norm(t.label));

  for (const label of productAllergenIngredient) {
    if (allergyLabels.has(label)) flags.push({ level: "block", reason: `contains ${label} (patient allergy)` });
  }
  for (const label of productCautions) {
    if (conditionLabels.has(label)) flags.push({ level: "warn", reason: `caution: ${label}` });
  }
  if (productDiets.length > 0) {
    for (const diet of dietPrefs) {
      if (!productDiets.includes(diet)) flags.push({ level: "warn", reason: `not tagged ${diet}` });
    }
  }
  return flags;
}

export function hasBlock(flags: Flag[]): boolean {
  return flags.some((f) => f.level === "block");
}

export function scoreProductForPatient(product: ProductDetail, attributes: PatientAttr[]): number {
  const goals = new Set(attributes.filter((a) => a.attrType === "goal").map((a) => norm(a.label)));
  return product.tags.filter((t) => t.tagType === "concern" && goals.has(norm(t.label))).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/flagging.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add deterministic flagging engine (block/warn/score)"
```

---

### Task 5: Plan data layer

**Files:**
- Create: `lib/plans.ts`
- Test: `test/plans.test.ts`

**Interfaces:**
- Consumes: `query`, `execute`; `getProduct` (`lib/products.ts`).
- Produces:
  - `type PlanItemDetail = { id: number; product: ProductDetail; dosingText: string; chosenAlternativeId: number|null; position: number }`
  - `type PlanDetail = { id: number; patientId: number; status: "draft"|"finalised"; items: PlanItemDetail[] }`
  - `getOrCreateDraftPlan(patientId: number, authorId?: number): Promise<number>` — returns the patient's existing draft plan id, or creates one.
  - `addPlanItem(planId: number, productId: number): Promise<number>` — appends at next position.
  - `removePlanItem(itemId: number): Promise<void>`
  - `setItemDosing(itemId: number, presetId: number|null, customText: string|null): Promise<void>`
  - `setItemAlternative(itemId: number, altProductId: number|null): Promise<void>`
  - `getPlan(planId: number): Promise<PlanDetail | null>` — resolves each item's full `ProductDetail` and dosing text (custom overrides preset; else preset text; else empty string).
  - `finalisePlan(planId: number): Promise<void>` — sets status `finalised`, bumps `updated_at`.
  - `dosingTextFor(presetId: number|null, customText: string|null): Promise<string>` — helper resolving preset/custom.

- [ ] **Step 1: Write `lib/plans.ts`**

```ts
import { query, execute } from "@/lib/db";
import { getProduct, type ProductDetail } from "@/lib/products";

export type PlanItemDetail = { id: number; product: ProductDetail; dosingText: string; chosenAlternativeId: number|null; position: number };
export type PlanDetail = { id: number; patientId: number; status: "draft"|"finalised"; items: PlanItemDetail[] };

export async function getOrCreateDraftPlan(patientId: number, authorId?: number): Promise<number> {
  const existing = await query<{ id: number }>("SELECT id FROM plans WHERE patient_id = ? AND status = 'draft' ORDER BY id DESC LIMIT 1", [patientId]);
  if (existing[0]) return existing[0].id;
  const rs = await execute("INSERT INTO plans (patient_id, author_id) VALUES (?, ?)", [patientId, authorId ?? null]);
  return Number(rs.lastInsertRowid);
}

export async function addPlanItem(planId: number, productId: number): Promise<number> {
  const pos = await query<{ n: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM plan_items WHERE plan_id = ?", [planId]);
  const rs = await execute("INSERT INTO plan_items (plan_id, product_id, position) VALUES (?, ?, ?)", [planId, productId, pos[0].n]);
  await execute("UPDATE plans SET updated_at = datetime('now') WHERE id = ?", [planId]);
  return Number(rs.lastInsertRowid);
}

export async function removePlanItem(itemId: number): Promise<void> {
  await execute("DELETE FROM plan_items WHERE id = ?", [itemId]);
}

export async function setItemDosing(itemId: number, presetId: number|null, customText: string|null): Promise<void> {
  await execute("UPDATE plan_items SET dosing_preset_id = ?, dosing_custom_text = ? WHERE id = ?", [presetId, customText, itemId]);
}

export async function setItemAlternative(itemId: number, altProductId: number|null): Promise<void> {
  await execute("UPDATE plan_items SET chosen_alternative_id = ? WHERE id = ?", [altProductId, itemId]);
}

export async function dosingTextFor(presetId: number|null, customText: string|null): Promise<string> {
  if (customText && customText.trim()) return customText.trim();
  if (presetId) {
    const rows = await query<{ text: string }>("SELECT text FROM dosing_presets WHERE id = ?", [presetId]);
    return rows[0]?.text ?? "";
  }
  return "";
}

export async function getPlan(planId: number): Promise<PlanDetail | null> {
  const base = await query<{ id: number; patient_id: number; status: "draft"|"finalised" }>(
    "SELECT id, patient_id, status FROM plans WHERE id = ?", [planId]
  );
  if (!base[0]) return null;
  const itemRows = await query<{ id: number; product_id: number; dosing_preset_id: number|null; dosing_custom_text: string|null; chosen_alternative_id: number|null; position: number }>(
    "SELECT id, product_id, dosing_preset_id, dosing_custom_text, chosen_alternative_id, position FROM plan_items WHERE plan_id = ? ORDER BY position", [planId]
  );
  const items: PlanItemDetail[] = [];
  for (const r of itemRows) {
    const product = await getProduct(r.product_id);
    if (!product) continue;
    items.push({
      id: r.id,
      product,
      dosingText: await dosingTextFor(r.dosing_preset_id, r.dosing_custom_text),
      chosenAlternativeId: r.chosen_alternative_id,
      position: r.position,
    });
  }
  return { id: base[0].id, patientId: base[0].patient_id, status: base[0].status, items };
}

export async function finalisePlan(planId: number): Promise<void> {
  await execute("UPDATE plans SET status = 'finalised', updated_at = datetime('now') WHERE id = ?", [planId]);
}
```

- [ ] **Step 2: Write the failing test**

`test/plans.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import * as Plans from "@/lib/plans";
import { execute } from "@/lib/db";

describe("plans", () => {
  let patientId = 0, productId = 0, presetId = 0;
  beforeAll(async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `PlanBrand ${Date.now()}` });
    productId = await createProduct({ brandId, name: "Test Magnesium", form: "capsule" });
    patientId = await createPatient({ name: "Test P", dob: "1990-01-01" });
    const rs = await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", ["evening", "Take 1 capsule in the evening."]);
    presetId = Number(rs.lastInsertRowid);
  });

  it("gets/creates one draft plan per patient (idempotent)", async () => {
    const a = await Plans.getOrCreateDraftPlan(patientId);
    const b = await Plans.getOrCreateDraftPlan(patientId);
    expect(a).toBe(b);
  });

  it("adds an item, sets dosing (custom overrides preset), and reads it back", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    const itemId = await Plans.addPlanItem(planId, productId);
    await Plans.setItemDosing(itemId, presetId, null);
    let plan = await Plans.getPlan(planId);
    expect(plan!.items[0].dosingText).toBe("Take 1 capsule in the evening.");

    await Plans.setItemDosing(itemId, presetId, "Take 2 with lunch.");
    plan = await Plans.getPlan(planId);
    expect(plan!.items[0].dosingText).toBe("Take 2 with lunch.");
  });

  it("finalises a plan", async () => {
    const planId = await Plans.getOrCreateDraftPlan(patientId);
    await Plans.finalisePlan(planId);
    const plan = await Plans.getPlan(planId);
    expect(plan!.status).toBe("finalised");
  });
});
```

- [ ] **Step 3: Run tests, then commit**

Run: `npx vitest run test/plans.test.ts` → PASS.
```bash
git add -A && git commit -m "feat: add plan data layer (draft plan, items, dosing, finalise)"
```

---

### Task 6: Patient screens (list + profile)

**Files:**
- Create: `app/patients/page.tsx`, `app/patients/new/page.tsx`, `app/patients/[id]/page.tsx`, `app/patients/actions.ts`
- Test: none (thin wrappers over tested `lib/patients.ts`; verified in browser at end of task)

**Interfaces:**
- Consumes: `lib/patients.ts`, `listTerms` (`lib/taxonomies.ts`), `requireUser`.
- Produces: server actions `createPatientAction`, `savePatientBasicsAction`, `savePatientAttributesAction`; patient list, new-patient, and profile pages.

**Attribute → taxonomy mapping (used on the profile page):** allergy → `allergen` terms, goal → `concern` terms, diet → `diet` terms, med_condition → `caution` terms.

- [ ] **Step 1: Write `app/patients/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createPatient, updatePatientBasics, setPatientAttributes, type AttrType } from "@/lib/patients";

export async function createPatientAction(formData: FormData) {
  const u = await requireUser();
  const id = await createPatient({ name: String(formData.get("name")), dob: String(formData.get("dob")), createdBy: u.userId });
  redirect(`/patients/${id}`);
}

export async function savePatientBasicsAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  await updatePatientBasics(id, { name: String(formData.get("name")), dob: String(formData.get("dob")) });
  revalidatePath(`/patients/${id}`);
}

export async function savePatientAttributesAction(formData: FormData) {
  await requireUser();
  const patientId = Number(formData.get("patientId"));
  const attrs: { termId: number; attrType: AttrType }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attr:")) {
      const attrType = key.slice(5) as AttrType;
      for (const id of String(value).split(",").filter(Boolean)) attrs.push({ termId: Number(id), attrType });
    }
  }
  await setPatientAttributes(patientId, attrs);
  revalidatePath(`/patients/${patientId}`);
}
```

- [ ] **Step 2: Write `app/patients/page.tsx` and `app/patients/new/page.tsx`**

`app/patients/page.tsx`:
```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";

export default async function PatientsPage() {
  await requireUser();
  const patients = await listPatients();
  return (
    <main style={{ maxWidth: 680, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontWeight: 500 }}>Patients</h1>
        <Link href="/patients/new">Add patient</Link>
      </div>
      <ul style={{ marginTop: 16 }}>
        {patients.map((p) => (
          <li key={p.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd" }}>
            <Link href={`/patients/${p.id}`}>{p.name}</Link>
            <span style={{ color: "#5F5E5A", fontSize: 13 }}> · DOB {p.dob}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`app/patients/new/page.tsx`:
```tsx
import { requireUser } from "@/lib/auth/current-user";
import { createPatientAction } from "@/app/patients/actions";

export default async function NewPatientPage() {
  await requireUser();
  return (
    <main style={{ maxWidth: 480, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>New patient</h1>
      <form action={createPatientAction} style={{ display: "grid", gap: 8 }}>
        <input name="name" placeholder="Full name" required />
        <input name="dob" type="date" required />
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write `app/patients/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient, type AttrType } from "@/lib/patients";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { savePatientBasicsAction, savePatientAttributesAction } from "@/app/patients/actions";

const ATTR_MAP: { attr: AttrType; term: TermType; label: string }[] = [
  { attr: "allergy", term: "allergen", label: "Allergies / intolerances" },
  { attr: "goal", term: "concern", label: "Health goals" },
  { attr: "diet", term: "diet", label: "Dietary preferences" },
  { attr: "med_condition", term: "caution", label: "Medications / conditions" },
];

export default async function PatientProfile({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const patient = await getPatient(id);
  if (!patient) notFound();
  const allTerms = await listTerms();

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", display: "grid", gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontWeight: 500 }}>{patient.name}</h1>
          <Link href={`/plan/${patient.id}`}>Open plan</Link>
        </div>
        <form action={savePatientBasicsAction} style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input type="hidden" name="id" value={patient.id} />
          <input name="name" defaultValue={patient.name} />
          <input name="dob" type="date" defaultValue={patient.dob} />
          <button type="submit">Save details</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Clinical profile</h2>
        <form action={savePatientAttributesAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="patientId" value={patient.id} />
          {ATTR_MAP.map(({ attr, term, label }) => {
            const selected = patient.attributes.filter((a) => a.attrType === attr).map((a) => String(a.termId));
            return (
              <label key={attr} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <select name={`attr:${attr}`} multiple defaultValue={selected}>
                  {allTerms.filter((t) => t.type === term).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            );
          })}
          <button type="submit">Save profile</button>
        </form>
        <p style={{ fontSize: 12, color: "#5F5E5A" }}>Terms come from admin → taxonomies. Allergies drive hard blocks; conditions and diet drive warnings.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Run the dev server (`preview_start` name `supplement-db-dev`), sign in, go to `/patients`, add a patient, set allergies/goals/diet/conditions, confirm they persist on reload.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add patient list and profile screens"
```

---

### Task 7: Plan builder screen

**Files:**
- Create: `app/plan/[patientId]/page.tsx`, `app/plan/actions.ts`, `components/PlanItemDosing.tsx`
- Test: `test/plan-flagging-integration.test.ts`

**Interfaces:**
- Consumes: `lib/plans.ts`, `lib/patients.ts`, `lib/flagging.ts`, `lib/products.ts` (`searchProducts`), dosing presets, `requireUser`, `recordAudit`.
- Produces: server actions `addItemAction`, `removeItemAction`, `saveDosingAction`, `chooseAlternativeAction`, `finaliseAndSendAction` (the last delegates to Task 9's `finaliseAndSend`); the plan builder page showing per-item flags and a patient flag banner.

- [ ] **Step 1: Write the failing integration test (plan + flagging together)**

`test/plan-flagging-integration.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, getPlan } from "@/lib/plans";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";

describe("plan + flagging integration", () => {
  it("flags a plan item that conflicts with the patient's allergy", async () => {
    await runMigrations();
    const brandId = await createBrand({ name: `Flag ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Mushroom Complex", form: "capsule" });
    const mushroom = await addTerm("allergen", "mushroom");
    await setProductTags(productId, [{ termId: mushroom, tagType: "allergen" }]);

    const patientId = await createPatient({ name: "Allergic P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }]);

    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    const plan = await getPlan(planId);
    const patient = await getPatient(patientId);
    const flags = flagProductForPatient(plan!.items[0].product, patient!.attributes);
    expect(hasBlock(flags)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run test/plan-flagging-integration.test.ts`
Expected: PASS (all deps already implemented).

- [ ] **Step 3: Write `app/plan/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { addPlanItem, removePlanItem, setItemDosing, setItemAlternative } from "@/lib/plans";
import { finaliseAndSend } from "@/lib/delivery";

export async function addItemAction(formData: FormData) {
  await requireUser();
  const planId = Number(formData.get("planId"));
  await addPlanItem(planId, Number(formData.get("productId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function removeItemAction(formData: FormData) {
  await requireUser();
  await removePlanItem(Number(formData.get("itemId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function saveDosingAction(formData: FormData) {
  await requireUser();
  const presetRaw = String(formData.get("presetId") || "");
  const custom = String(formData.get("customText") || "");
  await setItemDosing(Number(formData.get("itemId")), presetRaw ? Number(presetRaw) : null, custom || null);
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function chooseAlternativeAction(formData: FormData) {
  await requireUser();
  const altRaw = String(formData.get("altId") || "");
  await setItemAlternative(Number(formData.get("itemId")), altRaw ? Number(altRaw) : null);
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function finaliseAndSendAction(formData: FormData) {
  const u = await requireUser();
  await finaliseAndSend({
    planId: Number(formData.get("planId")),
    email: String(formData.get("email") || ""),
    actorId: u.userId,
  });
  revalidatePath(`/plan/${formData.get("patientId")}`);
}
```

- [ ] **Step 4: Write `components/PlanItemDosing.tsx`**

```tsx
"use client";
import { saveDosingAction } from "@/app/plan/actions";

type Preset = { id: number; label: string };

export default function PlanItemDosing({ itemId, patientId, presets, currentText }: { itemId: number; patientId: number; presets: Preset[]; currentText: string }) {
  return (
    <form action={saveDosingAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="patientId" value={patientId} />
      <select name="presetId" defaultValue="">
        <option value="">— preset —</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input name="customText" placeholder="or custom instruction" defaultValue={currentText} style={{ flex: 1, minWidth: 180 }} />
      <button type="submit">Save dosing</button>
    </form>
  );
}
```

- [ ] **Step 5: Write `app/plan/[patientId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, getPlan } from "@/lib/plans";
import { searchProducts } from "@/lib/products";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { query } from "@/lib/db";
import { addItemAction, removeItemAction, chooseAlternativeAction, finaliseAndSendAction } from "@/app/plan/actions";
import PlanItemDosing from "@/components/PlanItemDosing";

export default async function PlanBuilder({ params }: { params: { patientId: string } }) {
  const u = await requireUser();
  const patientId = Number(params.patientId);
  const patient = await getPatient(patientId);
  if (!patient) notFound();
  const planId = await getOrCreateDraftPlan(patientId, u.userId);
  const plan = await getPlan(planId);
  const presets = await query<{ id: number; label: string }>("SELECT id, label FROM dosing_presets ORDER BY id");
  const catalog = await searchProducts("");

  const itemFlags = plan!.items.map((it) => ({ item: it, flags: flagProductForPatient(it.product, patient.attributes) }));
  const planHasBlock = itemFlags.some(({ flags }) => hasBlock(flags));

  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>{patient.name} — plan</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>DOB {patient.dob} · {plan!.status}</p>

      <div style={{ margin: "12px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {patient.attributes.filter((a) => a.attrType === "allergy").map((a) => (
          <span key={`al-${a.termId}`} style={{ fontSize: 12, background: "#FCEBEB", color: "#A32D2D", padding: "3px 9px", borderRadius: 8 }}>Allergy: {a.label}</span>
        ))}
        {patient.attributes.filter((a) => a.attrType === "med_condition").map((a) => (
          <span key={`mc-${a.termId}`} style={{ fontSize: 12, background: "#FAEEDA", color: "#854F0B", padding: "3px 9px", borderRadius: 8 }}>Caution: {a.label}</span>
        ))}
      </div>

      <section style={{ marginTop: 8 }}>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Add a product</h2>
        <ul>
          {catalog.slice(0, 50).map((c) => (
            <li key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>{c.name} · {c.brand_name}</span>
              <form action={addItemAction}>
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="productId" value={c.id} />
                <button type="submit">Add</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Plan — {plan!.items.length} items</h2>
        {itemFlags.map(({ item, flags }) => (
          <div key={item.id} style={{ border: "0.5px solid #ddd", borderRadius: 12, padding: 12, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontWeight: 500 }}>{item.product.name}</strong>
              <form action={removeItemAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <button>Remove</button>
              </form>
            </div>
            {flags.map((f, i) => (
              <p key={i} style={{ fontSize: 12, margin: "4px 0", color: f.level === "block" ? "#A32D2D" : "#854F0B" }}>
                {f.level === "block" ? "BLOCK" : "Warning"}: {f.reason}
              </p>
            ))}
            {item.product.alternatives.length > 0 && (
              <form action={chooseAlternativeAction} style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="patientId" value={patientId} />
                <select name="altId" defaultValue={item.chosenAlternativeId ?? ""}>
                  <option value="">— offer an alternative format —</option>
                  {item.product.alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button type="submit">Set</button>
              </form>
            )}
            <PlanItemDosing itemId={item.id} patientId={patientId} presets={presets} currentText={item.dosingText} />
          </div>
        ))}
      </section>

      <section style={{ marginTop: 20 }}>
        {planHasBlock ? (
          <p style={{ color: "#A32D2D", fontSize: 14 }}>Resolve the blocked items above before this plan can be finalised and sent.</p>
        ) : (
          <form action={finaliseAndSendAction} style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <input name="email" type="email" placeholder="client@email.com" required />
            <button type="submit">Finalise &amp; send</button>
          </form>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Run the integration test + commit**

Run: `npx vitest run test/plan-flagging-integration.test.ts` → PASS.
(The page imports `finaliseAndSend` from `lib/delivery`, created in Task 9. Complete Task 9 before running the dev server; the unit test does not import the page.)
```bash
git add -A && git commit -m "feat: add plan builder screen with per-item flagging"
```

---

### Task 8: Clinic settings editor + PDF generation

**Files:**
- Create: `lib/settings.ts`, `app/admin/settings/page.tsx`, `app/admin/settings/actions.ts`, `lib/pdf.tsx`
- Test: `test/pdf.test.ts`
- Install: `@react-pdf/renderer`

**Interfaces:**
- Consumes: `query`, `execute`; `PlanDetail` (`lib/plans.ts`); `PatientDetail` (`lib/patients.ts`).
- Produces:
  - `getClinicSettings(): Promise<{ clinic_name: string|null; logo_url: string|null; address: string|null; contact: string|null; email_from: string|null }>`
  - `saveClinicSettings(input: {...same fields as strings...}): Promise<void>` — upserts the single `id=1` row.
  - `type PlanPdfData = { clinic: {...}; patientName: string; patientDob: string; preparedDate: string; items: { name: string; brand: string; packageSize: string|null; dosing: string; alternativeName: string|null; suppliers: { label: string; url: string }[] }[] }`
  - `buildPlanPdfData(plan: PlanDetail, patient: PatientDetail): Promise<PlanPdfData>` — resolves clinic settings, alternative names, and per-item dosing/suppliers into a flat, render-ready shape.
  - `renderPlanPdf(data: PlanPdfData): Promise<Buffer>` — returns the PDF bytes.

- [ ] **Step 1: Install the PDF library**

Run: `npm install @react-pdf/renderer`

- [ ] **Step 2: Write `lib/settings.ts`**

```ts
import { query, execute } from "@/lib/db";

export type ClinicSettings = { clinic_name: string|null; logo_url: string|null; address: string|null; contact: string|null; email_from: string|null };

export async function getClinicSettings(): Promise<ClinicSettings> {
  const rows = await query<ClinicSettings>("SELECT clinic_name, logo_url, address, contact, email_from FROM clinic_settings WHERE id = 1");
  return rows[0] ?? { clinic_name: null, logo_url: null, address: null, contact: null, email_from: null };
}

export async function saveClinicSettings(input: ClinicSettings): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, clinic_name, logo_url, address, contact, email_from)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET clinic_name = excluded.clinic_name, logo_url = excluded.logo_url,
       address = excluded.address, contact = excluded.contact, email_from = excluded.email_from`,
    [input.clinic_name, input.logo_url, input.address, input.contact, input.email_from]
  );
}
```

- [ ] **Step 3: Write `lib/pdf.tsx`**

```tsx
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { getClinicSettings } from "@/lib/settings";
import { getProduct } from "@/lib/products";
import type { PlanDetail } from "@/lib/plans";
import type { PatientDetail } from "@/lib/patients";

export type PlanPdfData = {
  clinic: { name: string; address: string; contact: string };
  patientName: string;
  patientDob: string;
  preparedDate: string;
  items: { name: string; brand: string; packageSize: string|null; dosing: string; alternativeName: string|null; suppliers: { label: string; url: string }[] }[];
};

export async function buildPlanPdfData(plan: PlanDetail, patient: PatientDetail): Promise<PlanPdfData> {
  const settings = await getClinicSettings();
  const items: PlanPdfData["items"] = [];
  for (const it of plan.items) {
    let alternativeName: string|null = null;
    if (it.chosenAlternativeId) {
      const alt = await getProduct(it.chosenAlternativeId);
      alternativeName = alt?.name ?? null;
    }
    items.push({
      name: it.product.name,
      brand: it.product.brand_name,
      packageSize: it.product.package_size,
      dosing: it.dosingText,
      alternativeName,
      suppliers: it.product.suppliers.map((s) => ({ label: s.label, url: s.url })),
    });
  }
  return {
    clinic: { name: settings.clinic_name ?? "Your clinic", address: settings.address ?? "", contact: settings.contact ?? "" },
    patientName: patient.name,
    patientDob: patient.dob,
    preparedDate: new Date().toISOString().slice(0, 10),
    items,
  };
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#2C2C2A" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#0F6E56", paddingBottom: 10 },
  clinic: { fontSize: 10, color: "#5F5E5A" },
  title: { fontSize: 16, color: "#0F6E56" },
  meta: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#F1EFE8", padding: 8, marginTop: 14 },
  item: { borderBottomWidth: 0.5, borderBottomColor: "#D3D1C7", paddingVertical: 10 },
  itemName: { fontSize: 13 },
  small: { fontSize: 10, color: "#5F5E5A", marginTop: 3 },
  alt: { fontSize: 10, color: "#0F6E56", backgroundColor: "#E1F5EE", padding: 5, marginTop: 4 },
  footer: { marginTop: 24, borderTopWidth: 0.5, borderTopColor: "#D3D1C7", paddingTop: 10, fontSize: 9, color: "#888780" },
});

function PlanDoc({ data }: { data: PlanPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={{ fontSize: 13, color: "#0F6E56" }}>{data.clinic.name}</Text>
            <Text style={s.clinic}>{data.clinic.address}</Text>
            <Text style={s.clinic}>{data.clinic.contact}</Text>
          </View>
          <View>
            <Text style={s.title}>Supplement plan</Text>
            <Text style={s.clinic}>Prepared {data.preparedDate}</Text>
          </View>
        </View>
        <View style={s.meta}>
          <Text>Prepared for {data.patientName}</Text>
          <Text>DOB {data.patientDob}</Text>
        </View>
        <View style={{ marginTop: 14 }}>
          {data.items.map((it, i) => (
            <View key={i} style={s.item}>
              <Text style={s.itemName}>{i + 1}  {it.name}</Text>
              <Text style={s.small}>{it.brand}{it.packageSize ? ` · ${it.packageSize}` : ""}</Text>
              {it.dosing ? <Text style={s.small}>How to take: {it.dosing}</Text> : null}
              {it.alternativeName ? <Text style={s.alt}>You can take this or, if you prefer, {it.alternativeName}.</Text> : null}
              {it.suppliers.length > 0 ? <Text style={s.small}>Order: {it.suppliers.map((sp) => `${sp.label} (${sp.url})`).join("  ·  ")}</Text> : null}
            </View>
          ))}
        </View>
        <Text style={s.footer}>
          This plan was prepared by your practitioner for your personal use and reflects your consultation.
          It is not a substitute for medical advice. Please tell your practitioner about any medications or changes to your health.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(data: PlanPdfData): Promise<Buffer> {
  return renderToBuffer(<PlanDoc data={data} />);
}
```

- [ ] **Step 4: Write the failing test**

`test/pdf.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderPlanPdf, type PlanPdfData } from "@/lib/pdf";

describe("pdf", () => {
  it("renders a non-empty PDF buffer with the PDF header", async () => {
    const data: PlanPdfData = {
      clinic: { name: "Lorna Clinic", address: "12 Harley St", contact: "020 7000 0000" },
      patientName: "Emma Hartley",
      patientDob: "1988-03-14",
      preparedDate: "2026-08-25",
      items: [{ name: "Magnesium", brand: "Wild Nutrition", packageSize: "60 caps", dosing: "1 at night", alternativeName: null, suppliers: [{ label: "Wild", url: "https://x" }] }],
    };
    const buf = await renderPlanPdf(data);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
```

- [ ] **Step 5: Run test**

Run: `npx vitest run test/pdf.test.ts`
Expected: PASS. (If `@react-pdf/renderer` needs JSX transform in Vitest, ensure the test imports compile — the file is `.tsx` and Vitest uses esbuild, which handles JSX by default.)

- [ ] **Step 6: Write settings editor `app/admin/settings/actions.ts` and `page.tsx`**

`actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { saveClinicSettings } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveClinicSettings({
    clinic_name: String(formData.get("clinic_name") || "") || null,
    logo_url: String(formData.get("logo_url") || "") || null,
    address: String(formData.get("address") || "") || null,
    contact: String(formData.get("contact") || "") || null,
    email_from: String(formData.get("email_from") || "") || null,
  });
  revalidatePath("/admin/settings");
}
```

`page.tsx`:
```tsx
import { requireAdmin } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getClinicSettings();
  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Clinic settings</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>These appear on every exported plan PDF.</p>
      <form action={saveSettingsAction} style={{ display: "grid", gap: 8 }}>
        <input name="clinic_name" defaultValue={s.clinic_name ?? ""} placeholder="Clinic name" />
        <input name="address" defaultValue={s.address ?? ""} placeholder="Address" />
        <input name="contact" defaultValue={s.contact ?? ""} placeholder="Phone / email" />
        <input name="logo_url" defaultValue={s.logo_url ?? ""} placeholder="Logo URL (optional)" />
        <input name="email_from" defaultValue={s.email_from ?? ""} placeholder="Send-from email (optional)" />
        <button type="submit">Save settings</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add clinic settings editor and branded PDF generation"
```

---

### Task 9: Finalise, snapshot, and email delivery

**Files:**
- Create: `lib/email.ts`, `lib/delivery.ts`
- Test: `test/delivery.test.ts`

**Interfaces:**
- Consumes: `getPlan`, `finalisePlan` (`lib/plans.ts`); `getPatient` (`lib/patients.ts`); `flagProductForPatient`, `hasBlock` (`lib/flagging.ts`); `buildPlanPdfData`, `renderPlanPdf` (`lib/pdf.tsx`); `recordAudit` (`lib/audit.ts`); `execute`, `query`.
- Produces:
  - `sendPlanEmail(input: { to: string; from: string; pdf: Buffer; patientName: string }): Promise<{ mocked: boolean }>` — uses Resend when `RESEND_API_KEY` set, else logs and returns `{ mocked: true }`.
  - `finaliseAndSend(input: { planId: number; email: string; actorId?: number }): Promise<{ snapshotId: number; mocked: boolean }>` — re-checks flags (throws `Error("Cannot send: plan has a blocked item")` if any hard block against the current patient profile), renders the PDF, stores a `plan_snapshots` row (frozen json + base64 pdf + send record), finalises the plan, records audit, sends email.
  - `listSnapshots(planId: number): Promise<{ id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]>`
  - `getSnapshotPdf(snapshotId: number): Promise<Buffer | null>`

- [ ] **Step 1: Write `lib/email.ts`**

```ts
export async function sendPlanEmail(input: { to: string; from: string; pdf: Buffer; patientName: string }): Promise<{ mocked: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] would send plan for ${input.patientName} to ${input.to} (${input.pdf.length} bytes)`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "plans@example.com",
    to: input.to,
    subject: "Your supplement plan",
    text: `Dear ${input.patientName},\n\nPlease find your supplement plan attached.\n\nBest wishes,\nYour practitioner`,
    attachments: [{ filename: "supplement-plan.pdf", content: input.pdf.toString("base64") }],
  });
  return { mocked: false };
}
```

- [ ] **Step 2: Write `lib/delivery.ts`**

```ts
import { execute, query } from "@/lib/db";
import { getPlan, finalisePlan } from "@/lib/plans";
import { getPatient } from "@/lib/patients";
import { flagProductForPatient, hasBlock } from "@/lib/flagging";
import { buildPlanPdfData, renderPlanPdf } from "@/lib/pdf";
import { getClinicSettings } from "@/lib/settings";
import { sendPlanEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

export async function finaliseAndSend(input: { planId: number; email: string; actorId?: number }): Promise<{ snapshotId: number; mocked: boolean }> {
  const plan = await getPlan(input.planId);
  if (!plan) throw new Error("Plan not found");
  const patient = await getPatient(plan.patientId);
  if (!patient) throw new Error("Patient not found");

  // Safety re-check against the CURRENT patient profile.
  for (const it of plan.items) {
    if (hasBlock(flagProductForPatient(it.product, patient.attributes))) {
      throw new Error("Cannot send: plan has a blocked item");
    }
  }

  const pdfData = await buildPlanPdfData(plan, patient);
  const pdf = await renderPlanPdf(pdfData);
  const settings = await getClinicSettings();

  const rs = await execute(
    `INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64, sent_to_email, sent_at, sent_by)
     VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    [input.planId, JSON.stringify(pdfData), pdf.toString("base64"), input.email, input.actorId ?? null]
  );
  const snapshotId = Number(rs.lastInsertRowid);

  await finalisePlan(input.planId);
  const { mocked } = await sendPlanEmail({ to: input.email, from: settings.email_from ?? "", pdf, patientName: patient.name });
  await recordAudit({ actorId: input.actorId, action: "finalised_and_sent", entity: "plan", entityId: input.planId, detail: `${plan.items.length} items → ${input.email}${mocked ? " (mock)" : ""}` });

  return { snapshotId, mocked };
}

export async function listSnapshots(planId: number): Promise<{ id: number; sent_to_email: string|null; sent_at: string|null; created_at: string }[]> {
  return query("SELECT id, sent_to_email, sent_at, created_at FROM plan_snapshots WHERE plan_id = ? ORDER BY created_at DESC", [planId]);
}

export async function getSnapshotPdf(snapshotId: number): Promise<Buffer | null> {
  const rows = await query<{ pdf_base64: string }>("SELECT pdf_base64 FROM plan_snapshots WHERE id = ?", [snapshotId]);
  if (!rows[0]) return null;
  return Buffer.from(rows[0].pdf_base64, "base64");
}
```

- [ ] **Step 3: Write the failing test**

`test/delivery.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct, setProductTags } from "@/lib/products";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { finaliseAndSend, listSnapshots, getSnapshotPdf } from "@/lib/delivery";

describe("delivery", () => {
  beforeAll(async () => { await runMigrations(); });

  it("blocks sending when an item conflicts with a patient allergy", async () => {
    const brandId = await createBrand({ name: `Del ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Mushroom X", form: "capsule" });
    const mushroom = await addTerm("allergen", "mushroom");
    await setProductTags(productId, [{ termId: mushroom, tagType: "allergen" }]);
    const patientId = await createPatient({ name: "Blocked P", dob: "1990-01-01" });
    await setPatientAttributes(patientId, [{ termId: mushroom, attrType: "allergy" }]);
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    await expect(finaliseAndSend({ planId, email: "c@example.com" })).rejects.toThrow(/blocked item/);
  });

  it("finalises, snapshots a PDF, and mock-sends a clean plan", async () => {
    const brandId = await createBrand({ name: `Clean ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Clean Magnesium", form: "capsule" });
    const patientId = await createPatient({ name: "Clean P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);

    const res = await finaliseAndSend({ planId, email: "c@example.com" });
    expect(res.mocked).toBe(true); // no RESEND_API_KEY in tests
    const snaps = await listSnapshots(planId);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].sent_to_email).toBe("c@example.com");
    const pdf = await getSnapshotPdf(res.snapshotId);
    expect(pdf!.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/delivery.test.ts`
Expected: PASS (2 tests). No email is dispatched (mock mode).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add finalise/snapshot/email delivery with safety re-check"
```

---

### Task 10: Patient file / history screen + PDF download route

**Files:**
- Create: `app/patients/[id]/history/page.tsx`, `app/api/snapshots/[id]/pdf/route.ts`
- Modify: `app/patients/[id]/page.tsx` (add a link to history)
- Test: none new (delivery covered in Task 9; verified in browser)

**Interfaces:**
- Consumes: `getPatient` (`lib/patients.ts`), `getOrCreateDraftPlan` + `getPlan` (`lib/plans.ts`), `listSnapshots`, `getSnapshotPdf` (`lib/delivery.ts`), `requireUser`.
- Produces: a history page listing snapshots (sent email + timestamp) with a download link; a route returning the snapshot PDF bytes.

- [ ] **Step 1: Write `app/api/snapshots/[id]/pdf/route.ts`**

```ts
import { getSnapshotPdf } from "@/lib/delivery";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const pdf = await getSnapshotPdf(Number(params.id));
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="supplement-plan-${params.id}.pdf"` },
  });
}
```

- [ ] **Step 2: Write `app/patients/[id]/history/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan } from "@/lib/plans";
import { listSnapshots } from "@/lib/delivery";

export default async function HistoryPage({ params }: { params: { id: string } }) {
  await requireUser();
  const patient = await getPatient(Number(params.id));
  if (!patient) notFound();
  const planId = await getOrCreateDraftPlan(patient.id);
  const snaps = await listSnapshots(planId);
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>{patient.name} — plan history</h1>
      {snaps.length === 0 ? <p style={{ color: "#5F5E5A" }}>No finalised plans yet.</p> : (
        <ul>
          {snaps.map((s) => (
            <li key={s.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd", display: "flex", justifyContent: "space-between" }}>
              <span>Sent {s.sent_at ?? s.created_at}{s.sent_to_email ? ` to ${s.sent_to_email}` : ""}</span>
              <Link href={`/api/snapshots/${s.id}/pdf`}>Download PDF</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Add a history link to the patient profile**

In `app/patients/[id]/page.tsx`, change the header link row to include history. Replace:
```tsx
          <Link href={`/plan/${patient.id}`}>Open plan</Link>
```
with:
```tsx
          <span style={{ display: "flex", gap: 12 }}>
            <Link href={`/patients/${patient.id}/history`}>History</Link>
            <Link href={`/plan/${patient.id}`}>Open plan</Link>
          </span>
```

- [ ] **Step 4: Full-suite check + browser verification**

Run: `npx vitest run` → all tests PASS.
Then run the dev server, and walk the full flow: create patient → set a mushroom allergy → open plan → add a mushroom-tagged product (see the BLOCK, finalise hidden) → remove it, add a clean product, set dosing → finalise & send (mock) → open History → download the PDF.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add patient plan history and PDF download route"
```

---

## Self-Review

**1. Spec coverage (Plan 2 slice):**
- Patient records (Name + DOB + allergies/goals/diet/meds) → Tasks 3, 6. ✓
- Editable plan that evolves over time → Task 5 (draft plan, add/remove/dosing), Task 7 (builder). ✓
- Dosing: preset dropdown + custom, or both → Task 1 (presets), Task 5 (`dosingTextFor`: custom overrides preset), Task 7 (`PlanItemDosing`). ✓
- Alternative-format offer on the plan → Task 5 (`setItemAlternative`), Task 7 (picker), Task 8 (PDF renders it). ✓
- Multiple supplier links on the plan/PDF → Task 8 (`buildPlanPdfData` includes `it.product.suppliers`). ✓
- Deterministic hard-block allergy flagging + soft warnings → Task 4. ✓
- Finalise-time safety re-check → Task 9 (`finaliseAndSend` throws on block). ✓
- Clinic-branded PDF → Task 8. ✓
- PDF archived per finalise (snapshot) → Task 9 (`plan_snapshots`). ✓
- Email delivery, mock without key → Tasks 9 (`sendPlanEmail`, `finaliseAndSend`). ✓
- Client email captured at send-time, not stored on patient → Task 7 (send form), Task 9 (stored on snapshot only); `patients` has no email column (Task 1). ✓
- Audit trail (finalise/send) → Tasks 2, 9. ✓
- Patient file / history + PDF retrieval → Task 10. ✓
- Deferred to Plan 3 (correct): two-stage recommendation *suggestions UI* (engine scoring stub `scoreProductForPatient` exists in Task 4), URL-enrichment assist, UI polish.

**2. Placeholder scan:** No "TBD/handle errors/etc." Every step has real code + exact commands. The one forward dependency (`lib/delivery` imported by Task 7's page) is explicitly called out with ordering guidance in Task 7 Step 6. ✓

**3. Type consistency:** `AttrType` defined in Task 3, reused in Tasks 6, 7. `PatientAttr`/`PatientDetail` (Task 3) consumed by Tasks 4, 9. `Flag`/`flagProductForPatient`/`hasBlock` (Task 4) consumed by Tasks 7, 9. `PlanDetail`/`PlanItemDetail`/`getPlan` (Task 5) consumed by Tasks 7, 8, 9. `ClinicSettings`/`getClinicSettings` (Task 8) consumed by Task 9. `finaliseAndSend` signature identical in Task 7 (action), Task 9 (definition), and both tests. `renderPlanPdf`/`buildPlanPdfData`/`PlanPdfData` (Task 8) consumed by Task 9. ✓

**Note for executor:** Tasks reuse the serial `file:test.db` harness from Plan 1 — no test-isolation changes needed. Run `npm run migrate`, `npm run seed` (admin), `npx tsx scripts/seed-dosing.ts` (presets), and optionally `npx tsx scripts/seed-demo.ts` before the browser walkthrough. Set clinic branding in `/admin/settings` so PDFs show real details.
