"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAppointmentType, archiveAppointmentType } from "@/lib/appointments";

export async function addAppointmentTypeAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes"));
  const price = String(formData.get("price") ?? "");
  if (!name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
  await createAppointmentType({ name, durationMinutes, price });
  revalidatePath("/admin/appointment-types");
}

export async function archiveAppointmentTypeAction(formData: FormData) {
  await requireAdmin();
  await archiveAppointmentType(Number(formData.get("id")));
  revalidatePath("/admin/appointment-types");
}
