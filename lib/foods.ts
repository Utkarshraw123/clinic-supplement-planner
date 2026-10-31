import { query, execute } from "@/lib/db";

export type FoodPanel = {
  energy_kcal: number; protein_g: number; carbs_g: number; sugars_g: number;
  fat_g: number; saturates_g: number; fibre_g: number; salt_g: number;
};
export type FoodRow = FoodPanel & { id: number; name: string; portion_label: string; status: string; created_by: number | null; created_at: string };
export type FoodInput = FoodPanel & { name: string; portionLabel: string };

export const PANEL_COLS: (keyof FoodPanel)[] = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "fat_g", "saturates_g", "fibre_g", "salt_g"];

export function foodNutrition(panel: FoodPanel, portions: number): FoodPanel {
  const out = {} as FoodPanel;
  for (const c of PANEL_COLS) out[c] = (panel[c] || 0) * portions;
  return out;
}

export async function createFood(input: FoodInput, createdBy?: number): Promise<number> {
  const rs = await execute(
    `INSERT INTO foods (name, portion_label, energy_kcal, protein_g, carbs_g, sugars_g, fat_g, saturates_g, fibre_g, salt_g, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.name.trim(), input.portionLabel.trim(), input.energy_kcal, input.protein_g, input.carbs_g, input.sugars_g, input.fat_g, input.saturates_g, input.fibre_g, input.salt_g, createdBy ?? null],
  );
  return Number(rs.lastInsertRowid);
}

export async function updateFood(id: number, input: FoodInput): Promise<void> {
  await execute(
    `UPDATE foods SET name=?, portion_label=?, energy_kcal=?, protein_g=?, carbs_g=?, sugars_g=?, fat_g=?, saturates_g=?, fibre_g=?, salt_g=? WHERE id=?`,
    [input.name.trim(), input.portionLabel.trim(), input.energy_kcal, input.protein_g, input.carbs_g, input.sugars_g, input.fat_g, input.saturates_g, input.fibre_g, input.salt_g, id],
  );
}

export async function getFood(id: number): Promise<FoodRow | null> {
  return (await query<FoodRow>("SELECT * FROM foods WHERE id = ?", [id]))[0] ?? null;
}

export async function listFoods(includeArchived = false): Promise<FoodRow[]> {
  return includeArchived
    ? query<FoodRow>("SELECT * FROM foods ORDER BY name")
    : query<FoodRow>("SELECT * FROM foods WHERE status = 'active' ORDER BY name");
}

export async function archiveFood(id: number): Promise<void> {
  await execute("UPDATE foods SET status = 'archived' WHERE id = ?", [id]);
}

export async function setFoodTags(foodId: number, termIds: number[]): Promise<void> {
  await execute("DELETE FROM food_tags WHERE food_id = ?", [foodId]);
  for (const t of termIds) await execute("INSERT INTO food_tags (food_id, taxonomy_term_id) VALUES (?, ?)", [foodId, t]);
}

export async function listFoodTagIds(foodId: number): Promise<number[]> {
  return (await query<{ taxonomy_term_id: number }>("SELECT taxonomy_term_id FROM food_tags WHERE food_id = ?", [foodId])).map((r) => r.taxonomy_term_id);
}
