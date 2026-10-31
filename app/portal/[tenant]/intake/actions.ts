"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { saveIntake } from "@/lib/intake";

export async function savePortalIntakeAction(tenant: string, formData: FormData) {
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  await runWithDb(client, () => saveIntake(patientId, {
    chiefConcern: String(formData.get("chiefConcern") ?? ""),
    healthHistory: String(formData.get("healthHistory") ?? ""),
    currentMedications: String(formData.get("currentMedications") ?? ""),
    currentSupplements: String(formData.get("currentSupplements") ?? ""),
    lifestyle: String(formData.get("lifestyle") ?? ""),
    goals: String(formData.get("goals") ?? ""),
  }));
  redirect(`/portal/${tenant}`);
}
