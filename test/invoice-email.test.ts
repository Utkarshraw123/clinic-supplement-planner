import { describe, it, expect, beforeAll } from "vitest";
import { sendInvoiceEmail } from "@/lib/email";

describe("sendInvoiceEmail", () => {
  beforeAll(() => { delete process.env.RESEND_API_KEY; });
  it("is mock-safe with no key", async () => {
    const res = await sendInvoiceEmail({ to: "p@example.test", from: "clinic@example.test", pdf: Buffer.from("%PDF-1.4 x"), patientName: "Pat", number: "INV-0001", payUrl: "https://pay.mock/x" });
    expect(res.mocked).toBe(true);
  });
});
