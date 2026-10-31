import { getTenantDb, runWithDb } from "@/lib/db";
import { listTenants } from "@/lib/control-users";
import { listDueReminders, markReminderSent } from "@/lib/appointments";
import { getClinicSettings } from "@/lib/settings";
import { sendReminderEmail } from "@/lib/email";

export async function sendDueRemindersForActiveTenant(withinHours = 24): Promise<{ sent: number; skipped: number; mocked: boolean }> {
  const settings = await getClinicSettings();
  const due = await listDueReminders(withinHours);
  let sent = 0, skipped = 0, mocked = false;
  for (const d of due) {
    if (!d.patient_email) { skipped++; continue; }
    const res = await sendReminderEmail({
      to: d.patient_email,
      from: settings.email_from ?? "",
      clinicName: settings.clinic_name ?? "Your clinic",
      patientName: d.patient_name ?? "there",
      whenIso: d.starts_at,
    });
    mocked = mocked || res.mocked;
    await markReminderSent(d.id);
    sent++;
  }
  return { sent, skipped, mocked };
}

export async function runAllReminders(withinHours = 24): Promise<{ tenants: number; sent: number }> {
  const tenants = await listTenants();
  let sent = 0;
  for (const t of tenants) {
    const client = await getTenantDb(t.id);
    const res = await runWithDb(client, () => sendDueRemindersForActiveTenant(withinHours));
    sent += res.sent;
  }
  return { tenants: tenants.length, sent };
}
