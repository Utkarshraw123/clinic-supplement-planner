"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { savePlanAsProtocol, applyProtocolToPlan, deleteProtocol } from "@/lib/protocols";

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
