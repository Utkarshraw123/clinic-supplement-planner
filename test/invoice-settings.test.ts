import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { getClinicSettings, saveInvoiceSettings, setStripeSecretKey } from "@/lib/settings";

describe("invoice settings", () => {
  beforeAll(async () => { await runMigrations(); });

  it("saves and reads invoicing config without clobbering the counter", async () => {
    await saveInvoiceSettings({ currency: "EUR", vat_rate: 23, vat_number: "IE1234567X", invoice_prefix: "LDN-" });
    const s1 = await getClinicSettings();
    expect(s1.currency).toBe("EUR");
    expect(s1.vat_rate).toBe(23);
    expect(s1.vat_number).toBe("IE1234567X");
    expect(s1.invoice_prefix).toBe("LDN-");
    expect(typeof s1.invoice_next_seq).toBe("number"); // defaulted, not null

    await setStripeSecretKey("sk_test_abc");
    const s2 = await getClinicSettings();
    expect(s2.stripe_secret_key).toBe("sk_test_abc");
    // saving invoice settings again must not wipe the key
    await saveInvoiceSettings({ currency: "GBP", vat_rate: null, vat_number: null, invoice_prefix: "INV-" });
    const s3 = await getClinicSettings();
    expect(s3.stripe_secret_key).toBe("sk_test_abc");
    expect(s3.currency).toBe("GBP");
  });
});
