import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createFood, getFood, listFoods, archiveFood, updateFood, setFoodTags, listFoodTagIds, foodNutrition } from "@/lib/foods";

const panel = { energy_kcal: 100, protein_g: 10, carbs_g: 5, sugars_g: 2, fat_g: 4, saturates_g: 1, fibre_g: 3, salt_g: 0.2 };

describe("foods", () => {
  beforeAll(async () => { await runMigrations(); });

  it("scales nutrition by portions (pure)", () => {
    const n = foodNutrition(panel, 2);
    expect(n.energy_kcal).toBe(200);
    expect(n.protein_g).toBe(20);
    expect(n.salt_g).toBeCloseTo(0.4);
    expect(foodNutrition(panel, 0.5).energy_kcal).toBe(50);
  });

  it("creates, reads, tags, lists, archives", async () => {
    const egg = await addTerm("allergen", "egg");
    const id = await createFood({ name: "Scrambled eggs", portionLabel: "2 eggs", ...panel });
    await setFoodTags(id, [egg]);
    const f = await getFood(id);
    expect(f?.name).toBe("Scrambled eggs");
    expect(f?.energy_kcal).toBe(100);
    expect(await listFoodTagIds(id)).toEqual([egg]);
    expect((await listFoods()).some((x) => x.id === id)).toBe(true);

    await updateFood(id, { name: "Scrambled eggs (2)", portionLabel: "2 eggs", ...panel, energy_kcal: 160 });
    expect((await getFood(id))?.energy_kcal).toBe(160);

    await archiveFood(id);
    expect((await listFoods()).some((x) => x.id === id)).toBe(false);
    expect((await listFoods(true)).some((x) => x.id === id)).toBe(true);
  });
});
