"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createAppointment, setAppointmentStatus } from "@/lib/appointments";

export async function bookAppointmentAction(formData: FormData) {
  const u = await requireUser();
  const patientId = Number(formData.get("patientId"));
  const appointmentTypeId = Number(formData.get("appointmentTypeId"));
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  if (!patientId || !appointmentTypeId || !date || !time) return;
  const startsAt = new Date(`${date}T${time}`).toISOString();
  await createAppointment({ patientId, appointmentTypeId, startsAt, practitionerId: u.userId, createdBy: u.userId });
  redirect("/appointments");
}

export async function setStatusAction(id: number, status: "completed" | "cancelled", backTo: string) {
  const u = await requireUser();
  await setAppointmentStatus(id, status, u.userId);
  revalidatePath(backTo);
}
