# Phase 3c-5 — Meal-Plan PDF + Email + GDPR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A branded meal-plan PDF (days → meals → items + per-day totals vs targets), an authed download route, a mock-safe email, an Email button on the builder, and GDPR erasure + export covering meal plans. Then a full browser smoke.

**Architecture:** `lib/meal-plan-pdf.tsx` renders the resolved `PlanTree`; `app/api/meal-plans/[id]/pdf/route.ts` streams it; `sendMealPlanEmail` mirrors the invoice email; `deletePatient` + `gdpr-export` learn about meal plans.

## Global Constraints

- Depends on 3c-3 (`getMealPlan`, `PANEL_KEYS`) + 3c-4 (builder). Mock-safe email. Tests green, tsc clean, Co-Authored-By trailer.

---

### Task 1: PDF + download route + email + builder Email button

- [ ] **Step 1: `lib/meal-plan-pdf.tsx`**

```tsx
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { MERRIWEATHER_REGULAR, MERRIWEATHER_BOLD } from "@/lib/pdf-fonts";
import { PANEL_KEYS, type PlanTree } from "@/lib/meal-plans";
import type { ClinicSettings } from "@/lib/settings";

Font.register({ family: "Merriweather", fonts: [{ src: MERRIWEATHER_REGULAR }, { src: MERRIWEATHER_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback((w) => [w]);

const GOLD = "#A17C3A"; const INK = "#2C2C2A"; const MUTED = "#6B6B63";
const LABELS: Record<string, string> = { energy_kcal: "kcal", protein_g: "P", carbs_g: "C", sugars_g: "sug", fat_g: "F", saturates_g: "sat", fibre_g: "fib", salt_g: "salt" };
const fmt = (k: string, v: number) => (k === "energy_kcal" ? Math.round(v).toString() : v.toFixed(1));

const st = StyleSheet.create({
  page: { fontFamily: "Merriweather", fontSize: 10, color: INK, padding: 44, lineHeight: 1.5 },
  h1: { fontSize: 18, fontWeight: 700, color: GOLD },
  muted: { color: MUTED },
  day: { marginTop: 14, borderTop: `1px solid ${GOLD}`, paddingTop: 8 },
  meal: { marginTop: 8 },
  mealName: { fontWeight: 700 },
  item: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2 },
  totals: { marginTop: 4, color: MUTED, fontSize: 9 },
});

export function MealPlanDoc({ tree, settings, patientName }: { tree: PlanTree; settings: ClinicSettings; patientName: string }) {
  const { plan, days } = tree;
  const targets: Record<string, number | null> = { energy_kcal: plan.target_kcal, protein_g: plan.target_protein_g, carbs_g: plan.target_carbs_g, fat_g: plan.target_fat_g, fibre_g: plan.target_fibre_g, salt_g: plan.target_salt_g };
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.h1}>{settings.clinic_name || "Meal plan"}</Text>
        <Text style={st.muted}>{plan.title ?? "Meal plan"} · {patientName}</Text>
        {days.map((d) => (
          <View key={d.id} style={st.day} wrap={false}>
            <Text style={{ fontWeight: 700 }}>{d.label}</Text>
            {d.meals.map((m) => (
              <View key={m.id} style={st.meal}>
                <Text style={st.mealName}>{m.name}</Text>
                {m.items.length === 0 ? <Text style={st.muted}>—</Text> : m.items.map((it) => (
                  <View key={it.id} style={st.item}><Text>{it.label} × {it.quantity}</Text><Text style={st.muted}>{Math.round(it.nutrition.energy_kcal)} kcal</Text></View>
                ))}
              </View>
            ))}
            <Text style={st.totals}>Day total: {PANEL_KEYS.map((k) => `${LABELS[k]} ${fmt(k, d.totals[k])}${targets[k] != null ? `/${fmt(k, targets[k] as number)}` : ""}`).join(" · ")}</Text>
          </View>
        ))}
        {plan.notes ? <View style={{ marginTop: 14 }}><Text style={st.muted}>Notes</Text><Text>{plan.notes}</Text></View> : null}
      </Page>
    </Document>
  );
}

export async function renderMealPlanPdf(tree: PlanTree, settings: ClinicSettings, patientName: string): Promise<Buffer> {
  return renderToBuffer(<MealPlanDoc tree={tree} settings={settings} patientName={patientName} />);
}
```

- [ ] **Step 2: test** `test/meal-plan-pdf.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createFood } from "@/lib/foods";
import { createMealPlan, addDay, addItem, getMealPlan } from "@/lib/meal-plans";
import { getClinicSettings } from "@/lib/settings";
import { renderMealPlanPdf } from "@/lib/meal-plan-pdf";

describe("renderMealPlanPdf", () => {
  beforeAll(async () => { await runMigrations(); });
  it("renders a meal plan to a PDF buffer", async () => {
    const pid = await createPatient({ name: "PDF Meal", dob: "1990-01-01" });
    const f = await createFood({ name: "Oats", portionLabel: "1 bowl", energy_kcal: 200, protein_g: 8, carbs_g: 30, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 6, salt_g: 0.1 });
    const planId = await createMealPlan(pid, { title: "W1", targetKcal: 500 }, 1);
    await addDay(planId);
    const tree0 = await getMealPlan(planId);
    await addItem(tree0!.days[0].meals[0].id, { itemType: "food", foodId: f, quantity: 1 });
    const tree = await getMealPlan(planId);
    const pdf = await renderMealPlanPdf(tree!, await getClinicSettings(), "PDF Meal");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
```

- [ ] **Step 3: download route** `app/api/meal-plans/[id]/pdf/route.ts`

```ts
import { requireUser } from "@/lib/auth/current-user";
import { getMealPlan } from "@/lib/meal-plans";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { renderMealPlanPdf } from "@/lib/meal-plan-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const tree = await getMealPlan(Number(params.id));
  if (!tree) return new Response("not found", { status: 404 });
  const settings = await getClinicSettings();
  const patient = tree.plan.patient_id ? await getPatient(tree.plan.patient_id) : null;
  const pdf = await renderMealPlanPdf(tree, settings, patient?.name ?? "Patient");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="meal-plan-${tree.plan.id}.pdf"` } });
}
```

- [ ] **Step 4: email** — append `sendMealPlanEmail` to `lib/email.ts`

```ts
export async function sendMealPlanEmail(input: { to: string; from: string; pdf: Buffer; patientName: string; title: string }): Promise<{ mocked: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] would send meal plan "${input.title}" to ${input.to} (${input.pdf.length} bytes)`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "plans@example.com",
    to: input.to,
    subject: `Your meal plan — ${input.title}`,
    text: `Dear ${input.patientName},\n\nPlease find your meal plan "${input.title}" attached.\n\nBest wishes.`,
    attachments: [{ filename: "meal-plan.pdf", content: input.pdf.toString("base64") }],
  });
  return { mocked: false };
}
```

- [ ] **Step 5: email action + builder Email button** — in `app/meal-plans/actions.ts` add:

```ts
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { getMealPlan } from "@/lib/meal-plans";
import { renderMealPlanPdf } from "@/lib/meal-plan-pdf";
import { sendMealPlanEmail } from "@/lib/email";

export async function emailMealPlanAction(planId: number, _fd?: FormData) {
  await requireUser();
  const tree = await getMealPlan(planId);
  if (!tree || !tree.plan.patient_id) return;
  const patient = await getPatient(tree.plan.patient_id);
  if (!patient?.email) return;
  const settings = await getClinicSettings();
  const pdf = await renderMealPlanPdf(tree, settings, patient.name);
  await sendMealPlanEmail({ to: patient.email, from: settings.email_from || "", pdf, patientName: patient.name, title: tree.plan.title ?? "Meal plan" });
  revalidatePath(`/meal-plans/${planId}`);
}
```

Then in `app/meal-plans/[id]/page.tsx`, import `emailMealPlanAction` and, in the header actions next to Download PDF, add (only when the patient has an email):

```tsx
          {patient?.email ? <form action={emailMealPlanAction.bind(null, id)}><button className="btn--sm">Email</button></form> : null}
```

- [ ] **Step 6: typecheck, test, commit**

```bash
npx vitest run test/meal-plan-pdf.test.ts
npx tsc --noEmit
git add lib/meal-plan-pdf.tsx test/meal-plan-pdf.test.ts "app/api/meal-plans/[id]/pdf/route.ts" lib/email.ts app/meal-plans/actions.ts "app/meal-plans/[id]/page.tsx"
git commit -m "feat(3c): meal-plan PDF, download route, mock-safe email

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: GDPR erasure + export

- [ ] **Step 1: test** `test/meal-plan-gdpr.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { createMealPlan, addDay, listMealPlansForPatient } from "@/lib/meal-plans";
import { exportPatientData } from "@/lib/gdpr-export";

describe("meal-plan GDPR", () => {
  beforeAll(async () => { await runMigrations(); });
  it("export includes meal plans; erasure removes them", async () => {
    const pid = await createPatient({ name: "GDPR Meal", dob: "1990-01-01" });
    const planId = await createMealPlan(pid, { title: "W" }, 1);
    await addDay(planId);
    const exp = await exportPatientData(pid);
    expect(exp.mealPlans.length).toBe(1);
    await deletePatient(pid, 1);
    expect(await listMealPlansForPatient(pid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: extend `deletePatient`** — in `lib/patients.ts`, before the `DELETE FROM portal_login_tokens` push, add:

```ts
  const mpIds = (await query<{ id: number }>("SELECT id FROM meal_plans WHERE patient_id = ?", [id])).map((r) => r.id);
  if (mpIds.length) {
    const mp = mpIds.map(() => "?").join(",");
    const dayIds = (await query<{ id: number }>(`SELECT id FROM meal_plan_days WHERE meal_plan_id IN (${mp})`, mpIds)).map((r) => r.id);
    if (dayIds.length) {
      const dp = dayIds.map(() => "?").join(",");
      const mealIds = (await query<{ id: number }>(`SELECT id FROM meal_plan_meals WHERE day_id IN (${dp})`, dayIds)).map((r) => r.id);
      if (mealIds.length) {
        const mlp = mealIds.map(() => "?").join(",");
        stmts.push({ sql: `DELETE FROM meal_plan_items WHERE meal_id IN (${mlp})`, args: mealIds });
      }
      stmts.push({ sql: `DELETE FROM meal_plan_meals WHERE day_id IN (${dp})`, args: dayIds });
    }
    stmts.push({ sql: `DELETE FROM meal_plan_days WHERE meal_plan_id IN (${mp})`, args: mpIds });
  }
  stmts.push({ sql: `DELETE FROM meal_plans WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 3: extend `lib/gdpr-export.ts`** — import `listMealPlansForPatient, getMealPlan, type PlanTree` from `@/lib/meal-plans`; add `mealPlans: PlanTree[]` to `PatientExport`; add `mealPlans: []` to the empty-patient return; before the final return build `const mpRows = await listMealPlansForPatient(patientId); const mealPlans: PlanTree[] = []; for (const mp of mpRows) { const t = await getMealPlan(mp.id); if (t) mealPlans.push(t); }` and add `mealPlans` to the return object.

- [ ] **Step 4: test, full suite, commit**

```bash
npx vitest run test/meal-plan-gdpr.test.ts
rm -f test.db && npm test
npx tsc --noEmit
git add lib/patients.ts lib/gdpr-export.ts test/meal-plan-gdpr.test.ts
git commit -m "feat(3c): GDPR erasure + export cover meal plans

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Browser smoke (mock mode)

- [ ] `npm run migrate:all`, start `supplement-db-dev`, sign in.
- [ ] `/admin/foods`: add 2 foods (one tagged with an allergen a test patient has). `/recipes`: create a recipe with one of them.
- [ ] A patient → Meal plans card → New meal plan (targets) → builder: add a food item + a recipe item to Breakfast → per-day totals vs targets show; if the patient is allergic, the warnings panel lists the conflict.
- [ ] Finalise → Download PDF (branded, days/meals/items + day totals) → Email (mock) → Save as template → `/meal-plans/templates` → Apply to another patient opens a copy.
- [ ] `preview_logs` level error → none. Stop the server. Commit any fixes.

## Self-Review

- Spec coverage: PDF + download + mock-safe email + GDPR erasure/export for meal plans ✓; browser smoke of the whole feature ✓.
- Types: `renderMealPlanPdf(tree, settings, patientName)` used by route + action; `PlanTree` in export.
