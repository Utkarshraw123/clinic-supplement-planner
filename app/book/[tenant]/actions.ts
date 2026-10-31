"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getOpenSlots } from "@/lib/availability";
import { getAppointmentType, createAppointment } from "@/lib/appointments";
import { findPatientByEmail, createPatient } from "@/lib/patients";

// Core booking logic under a given tenant (no redirect) — unit-testable.
export async function bookPublicSlot(tenant: string, input: { name: string; email: string; appointmentTypeId: number; slotIso: string }): Promise<{ ok: boolean; reason?: string }> {
  const client = await getTenantDb(tenant);
  return runWithDb(client, async () => {
    const type = await getAppointmentType(input.appointmentTypeId);
    if (!type || type.status !== "active") return { ok: false, reason: "type" };
    const date = input.slotIso.slice(0, 10);
    const open = await getOpenSlots(date, type.duration_minutes);
    if (!open.includes(input.slotIso)) return { ok: false, reason: "slot_taken" };

    const existing = await findPatientByEmail(input.email);
    const patientId = existing ? existing.id : await createPatient({ name: input.name, dob: "", email: input.email });
    await createAppointment({ patientId, appointmentTypeId: input.appointmentTypeId, startsAt: input.slotIso });
    return { ok: true };
  });
}

export async function bookPublicAction(tenant: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const appointmentTypeId = Number(formData.get("appointmentTypeId"));
  const slotIso = String(formData.get("slot") ?? "");
  if (!name || !email || !appointmentTypeId || !slotIso) redirect(`/book/${tenant}?error=missing`);
  const res = await bookPublicSlot(tenant, { name, email, appointmentTypeId, slotIso });
  redirect(res.ok ? `/book/${tenant}?booked=1` : `/book/${tenant}?error=${res.reason ?? "failed"}`);
}
