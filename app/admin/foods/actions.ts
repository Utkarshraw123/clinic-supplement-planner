"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createFood, updateFood, archiveFood, setFoodTags, type FoodInput } from "@/lib/foods";

function panelFrom(fd: FormData): FoodInput {
  const n = (k: string) => Number(fd.get(k) || 0);
  return {
    name: String(fd.get("name") || ""),
    portionLabel: String(fd.get("portion_label") || "1 portion"),
    energy_kcal: n("energy_kcal"), protein_g: n("protein_g"), carbs_g: n("carbs_g"), sugars_g: n("sugars_g"),
    fat_g: n("fat_g"), saturates_g: n("saturates_g"), fibre_g: n("fibre_g"), salt_g: n("salt_g"),
  };
}
function tagIds(fd: FormData): number[] {
  return fd.getAll("tag").map((v) => Number(v)).filter((n) => n > 0);
}

export async function addFoodAction(fd: FormData) {
  const u = await requireAdmin();
  const id = await createFood(panelFrom(fd), u.userId);
  await setFoodTags(id, tagIds(fd));
  revalidatePath("/admin/foods");
}

export async function updateFoodAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await updateFood(id, panelFrom(fd));
  await setFoodTags(id, tagIds(fd));
  revalidatePath("/admin/foods");
}

export async function archiveFoodAction(fd: FormData) {
  await requireAdmin();
  await archiveFood(Number(fd.get("id")));
  revalidatePath("/admin/foods");
}
