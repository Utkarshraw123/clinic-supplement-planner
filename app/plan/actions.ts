"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { addPlanItem, removePlanItem, setItemDosing, setItemAlternative, setItemNote, setItemDuration, setItemOrderCode, duplicatePlan } from "@/lib/plans";
import { finaliseAndSend, finalisePlanToSnapshot, sendSnapshotEmail } from "@/lib/delivery";

export async function addItemAction(formData: FormData) {
  await requireUser();
  const planId = Number(formData.get("planId"));
  await addPlanItem(planId, Number(formData.get("productId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

// Copy an existing plan into a fresh draft for the same patient, then open it in the builder.
export async function duplicatePlanAction(formData: FormData) {
  const u = await requireUser();
  const sourcePlanId = Number(formData.get("sourcePlanId"));
  const patientId = String(formData.get("patientId"));
  const newId = await duplicatePlan(sourcePlanId, u.userId);
  redirect(`/plan/${patientId}?plan=${newId}`);
}

export async function removeItemAction(formData: FormData) {
  await requireUser();
  await removePlanItem(Number(formData.get("itemId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

// One save for the whole per-item "prescription details" card: dosing, duration,
// order code and note in a single submit.
export async function saveItemFieldsAction(formData: FormData) {
  await requireUser();
  const itemId = Number(formData.get("itemId"));
  const presetRaw = String(formData.get("presetId") || "");
  const custom = String(formData.get("customText") || "");
  await setItemDosing(itemId, presetRaw ? Number(presetRaw) : null, custom || null);
  await setItemDuration(itemId, String(formData.get("duration") || ""));
  await setItemOrderCode(itemId, String(formData.get("orderCode") || ""));
  await setItemNote(itemId, String(formData.get("note") || ""));
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
  const planId = Number(formData.get("planId"));
  const patientId = String(formData.get("patientId"));
  const email = String(formData.get("email") || "").trim();

  // Email is optional: with an address we finalise AND send; without one we still
  // finalise into a downloadable PDF (for WhatsApp / patients who don't use email).
  if (email) {
    await finaliseAndSend({ planId, email, actorId: u.userId });
  } else {
    await finalisePlanToSnapshot({ planId, actorId: u.userId });
  }
  // Land on history, where the finalised PDF is immediately downloadable.
  redirect(`/patients/${patientId}/history`);
}

// Send a previously-finalised snapshot by email (from the history page).
export async function sendSnapshotAction(formData: FormData) {
  const u = await requireUser();
  await sendSnapshotEmail({
    snapshotId: Number(formData.get("snapshotId")),
    email: String(formData.get("email") || "").trim(),
    actorId: u.userId,
  });
  revalidatePath(`/patients/${formData.get("patientId")}/history`);
}
