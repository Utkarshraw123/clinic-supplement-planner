"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import {
  savePlanAsProtocol, applyProtocolToPlan, deleteProtocol,
  createProtocol, updateProtocolMeta, addProtocolItem, removeProtocolItem, setProtocolItemDosing,
} from "@/lib/protocols";

// --- Standalone protocol builder ---

export async function createProtocolAction(formData: FormData) {
  const u = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const id = await createProtocol(name, String(formData.get("description") || "") || null, u.userId);
  redirect(`/protocols/${id}`);
}

export async function updateProtocolMetaAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  await updateProtocolMeta(id, String(formData.get("name") || ""), String(formData.get("description") || "") || null);
  revalidatePath(`/protocols/${id}`);
}

export async function addProtocolItemAction(formData: FormData) {
  await requireUser();
  const protocolId = Number(formData.get("protocolId"));
  await addProtocolItem(protocolId, Number(formData.get("productId")));
  revalidatePath(`/protocols/${protocolId}`);
}

export async function removeProtocolItemAction(formData: FormData) {
  await requireUser();
  await removeProtocolItem(Number(formData.get("itemId")));
  revalidatePath(`/protocols/${formData.get("protocolId")}`);
}

export async function setProtocolItemDosingAction(formData: FormData) {
  await requireUser();
  const presetRaw = String(formData.get("presetId") || "");
  const custom = String(formData.get("customText") || "");
  await setProtocolItemDosing(Number(formData.get("itemId")), presetRaw ? Number(presetRaw) : null, custom || null);
  revalidatePath(`/protocols/${formData.get("protocolId")}`);
}

export async function saveAsProtocolAction(formData: FormData) {
  const u = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await savePlanAsProtocol(Number(formData.get("planId")), name, String(formData.get("description") || "") || null, u.userId);
  revalidatePath(`/plan/${formData.get("patientId")}`);
  revalidatePath("/protocols");
}

export async function applyProtocolAction(formData: FormData) {
  await requireUser();
  const protocolId = Number(formData.get("protocolId"));
  if (!protocolId) return;
  await applyProtocolToPlan(protocolId, Number(formData.get("planId")));
  revalidatePath(`/plan/${formData.get("patientId")}`);
}

export async function deleteProtocolAction(formData: FormData) {
  await requireUser();
  await deleteProtocol(Number(formData.get("id")));
  revalidatePath("/protocols");
}
