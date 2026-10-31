import { query, execute } from "@/lib/db";
import { foodNutrition, type FoodPanel, type FoodRow } from "@/lib/foods";

export type RecipeRow = { id: number; name: string; servings: number; method: string | null; status: string; created_by: number | null; created_at: string };
export type RecipeItemRow = { id: number; recipe_id: number; food_id: number; portions: number; sort: number };
export type RecipeItemResolved = RecipeItemRow & { food: FoodRow };

const KEYS: (keyof FoodPanel)[] = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"];
const zero = (): FoodPanel => ({ energy_kcal: 0, protein_g: 0, carbs_g: 0, sugars_g: 0, fat_g: 0, saturates_g: 0, fibre_g: 0, salt_g: 0 });

export function recipeNutrition(items: { food: FoodPanel; portions: number }[], servings: number): { whole: FoodPanel; perServing: FoodPanel } {
  const whole = items.reduce((acc, it) => { const n = foodNutrition(it.food, it.portions); KEYS.forEach((k) => (acc[k] += n[k])); return acc; }, zero());
  const s = servings > 0 ? servings : 1;
  const perServing = zero();
  KEYS.forEach((k) => (perServing[k] = whole[k] / s));
  return { whole, perServing };
}

export async function createRecipe(name: string, servings: number, method: string | null, createdBy?: number): Promise<number> {
  const rs = await execute("INSERT INTO recipes (name, servings, method, created_by) VALUES (?, ?, ?, ?)", [name.trim(), Math.max(1, servings || 1), (method || "").trim() || null, createdBy ?? null]);
  return Number(rs.lastInsertRowid);
}
export async function updateRecipe(id: number, name: string, servings: number, method: string | null): Promise<void> {
  await execute("UPDATE recipes SET name=?, servings=?, method=? WHERE id=?", [name.trim(), Math.max(1, servings || 1), (method || "").trim() || null, id]);
}
export async function archiveRecipe(id: number): Promise<void> { await execute("UPDATE recipes SET status='archived' WHERE id=?", [id]); }
export async function listRecipes(includeArchived = false): Promise<RecipeRow[]> {
  return includeArchived ? query<RecipeRow>("SELECT * FROM recipes ORDER BY name") : query<RecipeRow>("SELECT * FROM recipes WHERE status='active' ORDER BY name");
}
export async function getRecipe(id: number): Promise<{ recipe: RecipeRow; items: RecipeItemResolved[] } | null> {
  const recipe = (await query<RecipeRow>("SELECT * FROM recipes WHERE id=?", [id]))[0];
  if (!recipe) return null;
  const rows = await query<RecipeItemRow>("SELECT * FROM recipe_items WHERE recipe_id=? ORDER BY sort, id", [id]);
  const items: RecipeItemResolved[] = [];
  for (const r of rows) { const food = (await query<FoodRow>("SELECT * FROM foods WHERE id=?", [r.food_id]))[0]; if (food) items.push({ ...r, food }); }
  return { recipe, items };
}
export async function setRecipeItems(recipeId: number, items: { foodId: number; portions: number }[]): Promise<void> {
  await execute("DELETE FROM recipe_items WHERE recipe_id=?", [recipeId]);
  let sort = 0;
  for (const it of items) await execute("INSERT INTO recipe_items (recipe_id, food_id, portions, sort) VALUES (?, ?, ?, ?)", [recipeId, it.foodId, it.portions, sort++]);
}
export async function recipeTagIds(recipeId: number): Promise<number[]> {
  const rows = await query<{ taxonomy_term_id: number }>(
    "SELECT DISTINCT ft.taxonomy_term_id FROM recipe_items ri JOIN food_tags ft ON ft.food_id = ri.food_id WHERE ri.recipe_id = ?",
    [recipeId],
  );
  return rows.map((r) => r.taxonomy_term_id);
}
