import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createFood, setFoodTags } from "@/lib/foods";
import { createRecipe, getRecipe, setRecipeItems, recipeNutrition, recipeTagIds, listRecipes } from "@/lib/recipes";

const p = (kcal: number) => ({ energy_kcal: kcal, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 });

describe("recipes", () => {
  beforeAll(async () => { await runMigrations(); });

  it("computes whole + per-serving nutrition (pure)", () => {
    const r = recipeNutrition([{ food: p(100), portions: 2 }, { food: p(50), portions: 1 }], 5);
    expect(r.whole.energy_kcal).toBe(250);
    expect(r.perServing.energy_kcal).toBe(50);
  });

  it("builds a recipe, resolves items, unions ingredient tags", async () => {
    const egg = await addTerm("allergen", "egg");
    const f1 = await createFood({ name: "Eggs", portionLabel: "2 eggs", ...p(140) });
    await setFoodTags(f1, [egg]);
    const f2 = await createFood({ name: "Spinach", portionLabel: "1 handful", ...p(20) });
    const rid = await createRecipe("Omelette", 2, "Whisk and cook.");
    await setRecipeItems(rid, [{ foodId: f1, portions: 1 }, { foodId: f2, portions: 2 }]);
    const got = await getRecipe(rid);
    expect(got?.items).toHaveLength(2);
    expect(got?.recipe.servings).toBe(2);
    expect(await recipeTagIds(rid)).toContain(egg);
    expect((await listRecipes()).some((x) => x.id === rid)).toBe(true);
  });
});
