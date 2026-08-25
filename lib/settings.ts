import { query, execute } from "@/lib/db";

export type ClinicSettings = { clinic_name: string|null; logo_url: string|null; address: string|null; contact: string|null; email_from: string|null };

export async function getClinicSettings(): Promise<ClinicSettings> {
  const rows = await query<ClinicSettings>("SELECT clinic_name, logo_url, address, contact, email_from FROM clinic_settings WHERE id = 1");
  return rows[0] ?? { clinic_name: null, logo_url: null, address: null, contact: null, email_from: null };
}

export async function saveClinicSettings(input: ClinicSettings): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, clinic_name, logo_url, address, contact, email_from)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET clinic_name = excluded.clinic_name, logo_url = excluded.logo_url,
       address = excluded.address, contact = excluded.contact, email_from = excluded.email_from`,
    [input.clinic_name, input.logo_url, input.address, input.contact, input.email_from]
  );
}
