"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { addPlanItem, removePlanItem, setItemDosing, setItemAlternative, setItemNote } from "@/lib/plans";
import { finaliseAndSend, finalisePlanToSnapshot, sendSnapshotEmail } from "@/lib/delivery";

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

export async function saveItemNoteAction(formData: FormData) {
  await requireUser();
  await setItemNote(Number(formData.get("itemId")), String(formData.get("note") || ""));
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
