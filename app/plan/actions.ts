"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { addPlanItem, removePlanItem, setItemDosing, setItemAlternative } from "@/lib/plans";
import { finaliseAndSend } from "@/lib/delivery";

export async function addItemAction(formData: FormData) {
  await requireUser();
  const planId = Number(formData.get("planId"));
  await addPlanItem(planId, Number(formData.get("productId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function removeItemAction(formData: FormData) {
  await requireUser();
  await removePlanItem(Number(formData.get("itemId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function saveDosingAction(formData: FormData) {
  await requireUser();
  const presetRaw = String(formData.get("presetId") || "");
  const custom = String(formData.get("customText") || "");
  await setItemDosing(Number(formData.get("itemId")), presetRaw ? Number(presetRaw) : null, custom || null);
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function chooseAlternativeAction(formData: FormData) {
  await requireUser();
  const altRaw = String(formData.get("altId") || "");
  await setItemAlternative(Number(formData.get("itemId")), altRaw ? Number(altRaw) : null);
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function finaliseAndSendAction(formData: FormData) {
  const u = await requireUser();
  await finaliseAndSend({
    planId: Number(formData.get("planId")),
    email: String(formData.get("email") || ""),
    actorId: u.userId,
  });
  revalidatePath(`/plan/${formData.get("patientId")}`);
}
