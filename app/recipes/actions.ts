"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createRecipe, updateRecipe, setRecipeItems, archiveRecipe } from "@/lib/recipes";

function parseItems(raw: string): { foodId: number; portions: number }[] {
  try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? a.map((r) => ({ foodId: Number(r.foodId), portions: Number(r.portions) || 0 })).filter((r) => r.foodId > 0) : []; } catch { return []; }
}

export async function createRecipeAction(fd: FormData) {
  const u = await requireUser();
  const id = await createRecipe(String(fd.get("name") || ""), Number(fd.get("servings") || 1), String(fd.get("method") || ""), u.userId);
  redirect(`/recipes/${id}`);
}
export async function saveRecipeAction(id: number, fd: FormData) {
  await requireUser();
  await updateRecipe(id, String(fd.get("name") || ""), Number(fd.get("servings") || 1), String(fd.get("method") || ""));
  await setRecipeItems(id, parseItems(String(fd.get("items") || "[]")));
  revalidatePath(`/recipes/${id}`);
}
export async function archiveRecipeAction(id: number, _fd?: FormData) {
  await requireUser();
  await archiveRecipe(id);
  redirect("/recipes");
}
