"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { addAvailabilityWindow, removeAvailabilityWindow } from "@/lib/availability";

export async function addAvailabilityAction(formData: FormData) {
  await requireAdmin();
  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!Number.isInteger(weekday) || !startTime || !endTime || startTime >= endTime) return;
  await addAvailabilityWindow({ weekday, startTime, endTime });
  revalidatePath("/admin/availability");
}

export async function removeAvailabilityAction(formData: FormData) {
  await requireAdmin();
  await removeAvailabilityWindow(Number(formData.get("id")));
  revalidatePath("/admin/availability");
}
