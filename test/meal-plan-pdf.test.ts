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
