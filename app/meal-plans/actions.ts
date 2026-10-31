"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import {
  createMealPlan, updatePlanMeta, addDay, removeDay, addMeal, renameMeal, removeMeal,
  addItem, removeItem, finaliseMealPlan, saveAsTemplate, applyTemplate, getMealPlan,
} from "@/lib/meal-plans";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { renderMealPlanPdf } from "@/lib/meal-plan-pdf";
import { sendMealPlanEmail } from "@/lib/email";

const num = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export async function createMealPlanAction(fd: FormData) {
  const u = await requireUser();
  const patientId = Number(fd.get("patientId"));
  const id = await createMealPlan(patientId, {
    title: String(fd.get("title") || "Meal plan"),
    targetKcal: num(fd.get("target_kcal")), targetProtein: num(fd.get("target_protein_g")),
    targetCarbs: num(fd.get("target_carbs_g")), targetFat: num(fd.get("target_fat_g")),
    targetFibre: num(fd.get("target_fibre_g")), targetSalt: num(fd.get("target_salt_g")),
  }, u.userId);
  await addDay(id);
  redirect(`/meal-plans/${id}`);
}

export async function saveMetaAction(planId: number, fd: FormData) {
  await requireUser();
  await updatePlanMeta(planId, {
    title: String(fd.get("title") || ""), notes: String(fd.get("notes") || ""), startDate: String(fd.get("start_date") || ""),
    targetKcal: num(fd.get("target_kcal")), targetProtein: num(fd.get("target_protein_g")),
    targetCarbs: num(fd.get("target_carbs_g")), targetFat: num(fd.get("target_fat_g")),
    targetFibre: num(fd.get("target_fibre_g")), targetSalt: num(fd.get("target_salt_g")),
  });
  revalidatePath(`/meal-plans/${planId}`);
}

export async function addDayAction(planId: number, _fd?: FormData) { await requireUser(); await addDay(planId); revalidatePath(`/meal-plans/${planId}`); }
export async function removeDayAction(planId: number, dayId: number, _fd?: FormData) { await requireUser(); await removeDay(dayId); revalidatePath(`/meal-plans/${planId}`); }
export async function addMealAction(planId: number, dayId: number, fd: FormData) { await requireUser(); await addMeal(dayId, String(fd.get("name") || "Meal")); revalidatePath(`/meal-plans/${planId}`); }
export async function renameMealAction(planId: number, mealId: number, fd: FormData) { await requireUser(); await renameMeal(mealId, String(fd.get("name") || "Meal")); revalidatePath(`/meal-plans/${planId}`); }
export async function removeMealAction(planId: number, mealId: number, _fd?: FormData) { await requireUser(); await removeMeal(mealId); revalidatePath(`/meal-plans/${planId}`); }

export async function addItemAction(planId: number, mealId: number, fd: FormData) {
  await requireUser();
  const ref = String(fd.get("ref") || "");
  const quantity = Number(fd.get("quantity") || 1) || 1;
  const [kind, idStr] = ref.split(":");
  const id = Number(idStr);
  if (kind === "food" && id) await addItem(mealId, { itemType: "food", foodId: id, quantity });
  else if (kind === "recipe" && id) await addItem(mealId, { itemType: "recipe", recipeId: id, quantity });
  revalidatePath(`/meal-plans/${planId}`);
}
export async function removeItemAction(planId: number, itemId: number, _fd?: FormData) { await requireUser(); await removeItem(itemId); revalidatePath(`/meal-plans/${planId}`); }

export async function finaliseMealPlanAction(planId: number, _fd?: FormData) { const u = await requireUser(); await finaliseMealPlan(planId, u.userId); revalidatePath(`/meal-plans/${planId}`); }
export async function saveAsTemplateAction(planId: number, fd: FormData) { const u = await requireUser(); await saveAsTemplate(planId, String(fd.get("title") || "Template"), u.userId); revalidatePath(`/meal-plans/${planId}`); }
export async function applyTemplateAction(templateId: number, fd: FormData) { const u = await requireUser(); const pid = Number(fd.get("patientId")); const id = await applyTemplate(templateId, pid, u.userId); redirect(`/meal-plans/${id}`); }

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
