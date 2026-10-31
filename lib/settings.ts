import { query, execute } from "@/lib/db";

export type BaseClinicSettings = { clinic_name: string|null; logo_url: string|null; address: string|null; contact: string|null; email_from: string|null; letterhead_template: string|null };
export type ClinicSettings = BaseClinicSettings & {
  currency: string|null; vat_rate: number|null; vat_number: string|null;
  invoice_prefix: string|null; invoice_next_seq: number|null; stripe_secret_key: string|null;
};

export async function getClinicSettings(): Promise<ClinicSettings> {
  const rows = await query<ClinicSettings>(
    `SELECT clinic_name, logo_url, address, contact, email_from, letterhead_template,
            currency, vat_rate, vat_number, invoice_prefix, invoice_next_seq, stripe_secret_key
       FROM clinic_settings WHERE id = 1`
  );
  return rows[0] ?? {
    clinic_name: null, logo_url: null, address: null, contact: null, email_from: null, letterhead_template: null,
    currency: null, vat_rate: null, vat_number: null, invoice_prefix: null, invoice_next_seq: null, stripe_secret_key: null,
  };
}

export async function saveClinicSettings(input: BaseClinicSettings): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, clinic_name, logo_url, address, contact, email_from, letterhead_template)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET clinic_name = excluded.clinic_name, logo_url = excluded.logo_url,
       address = excluded.address, contact = excluded.contact, email_from = excluded.email_from,
       letterhead_template = excluded.letterhead_template`,
    [input.clinic_name, input.logo_url, input.address, input.contact, input.email_from, input.letterhead_template]
  );
}

export async function saveInvoiceSettings(input: { currency: string|null; vat_rate: number|null; vat_number: string|null; invoice_prefix: string|null }): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, currency, vat_rate, vat_number, invoice_prefix)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET currency = excluded.currency, vat_rate = excluded.vat_rate,
       vat_number = excluded.vat_number, invoice_prefix = excluded.invoice_prefix`,
    [input.currency || "EUR", input.vat_rate, input.vat_number, input.invoice_prefix || "INV-"]
  );
}

export async function setStripeSecretKey(key: string): Promise<void> {
  await execute(
    `INSERT INTO clinic_settings (id, stripe_secret_key) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET stripe_secret_key = excluded.stripe_secret_key`,
    [key]
  );
}
