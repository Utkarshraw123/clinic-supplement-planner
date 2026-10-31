import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes } from "@/lib/patients";
import { createFood, setFoodTags } from "@/lib/foods";
import { createRecipe, setRecipeItems } from "@/lib/recipes";
import {
  createMealPlan, addDay, addItem, getMealPlan, finaliseMealPlan,
  saveAsTemplate, applyTemplate, listTemplates, listMealPlansForPatient, planWarnings,
} from "@/lib/meal-plans";

const p = (kcal: number) => ({ energy_kcal: kcal, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 });

describe("meal plans", () => {
  beforeAll(async () => { await runMigrations(); });

  it("builds a day (seeds meals), sums nutrition, finalises, templates round-trip", async () => {
    const pid = await createPatient({ name: "Meal P", dob: "1990-01-01" });
    const f = await createFood({ name: "Oats", portionLabel: "1 bowl", ...p(200) });
    const rf = await createFood({ name: "Berries", portionLabel: "1 handful", ...p(40) });
    const rid = await createRecipe("Berry bowl", 2, null);
    await setRecipeItems(rid, [{ foodId: rf, portions: 2 }]); // whole 80, per serving 40

    const planId = await createMealPlan(pid, { title: "Week 1", targetKcal: 500 }, 1);
    await addDay(planId);
    const tree0 = await getMealPlan(planId);
    const breakfast = tree0!.days[0].meals.find((m) => m.name === "Breakfast")!;
    expect(tree0!.days[0].meals).toHaveLength(5);

    await addItem(breakfast.id, { itemType: "food", foodId: f, quantity: 1 });        // 200
    await addItem(breakfast.id, { itemType: "recipe", recipeId: rid, quantity: 2 });   // 40*2 = 80
    const tree = await getMealPlan(planId);
    const bf = tree!.days[0].meals.find((m) => m.name === "Breakfast")!;
    expect(bf.totals.energy_kcal).toBe(280);
    expect(tree!.days[0].totals.energy_kcal).toBe(280);

    await finaliseMealPlan(planId, 1);
    expect((await getMealPlan(planId))!.plan.status).toBe("final");

    const tplId = await saveAsTemplate(planId, "Week 1 template", 1);
    expect((await listTemplates()).some((t) => t.id === tplId)).toBe(true);
    const pid2 = await createPatient({ name: "Meal P2", dob: "1990-01-01" });
    const applied = await applyTemplate(tplId, pid2, 1);
    const at = await getMealPlan(applied);
    expect(at!.plan.patient_id).toBe(pid2);
    expect(at!.days[0].meals.find((m) => m.name === "Breakfast")!.totals.energy_kcal).toBe(280);
    expect((await listMealPlansForPatient(pid2)).some((m) => m.id === applied)).toBe(true);
  });

  it("warns on allergen conflicts (never blocks)", async () => {
    const egg = await addTerm("allergen", "egg");
    const vegan = await addTerm("diet", "Vegan");
    const pid = await createPatient({ name: "Allergic P", dob: "1990-01-01" });
    await setPatientAttributes(pid, [{ termId: egg, attrType: "allergy" }, { termId: vegan, attrType: "diet" }]);

    const eggy = await createFood({ name: "Eggs", portionLabel: "2 eggs", ...p(140) });
    await setFoodTags(eggy, [egg]); // contains egg
    const planId = await createMealPlan(pid, { title: "W" }, 1);
    await addDay(planId);
    const tree = await getMealPlan(planId);
    await addItem(tree!.days[0].meals[0].id, { itemType: "food", foodId: eggy, quantity: 1 });

    const w = await planWarnings(planId, pid);
    expect(w.some((x) => x.message.includes("contains egg"))).toBe(true);
  });
});
