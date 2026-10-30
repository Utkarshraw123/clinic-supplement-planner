"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { saveIntake } from "@/lib/intake";

export async function saveIntakeAction(patientId: number, formData: FormData) {
  const u = await requireUser();
  await saveIntake(patientId, {
    chiefConcern: String(formData.get("chiefConcern") ?? ""),
    healthHistory: String(formData.get("healthHistory") ?? ""),
    currentMedications: String(formData.get("currentMedications") ?? ""),
    currentSupplements: String(formData.get("currentSupplements") ?? ""),
    lifestyle: String(formData.get("lifestyle") ?? ""),
    goals: String(formData.get("goals") ?? ""),
    updatedBy: u.userId,
  });
  redirect(`/patients/${patientId}`);
}
