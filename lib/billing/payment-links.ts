import Stripe from "stripe";
import type { InvoiceRow } from "@/lib/invoices";

export async function createPaymentLink(input: { invoice: InvoiceRow; key?: string | null; productName?: string }): Promise<{ url: string; mocked: boolean }> {
  const key = input.key ?? undefined;
  const ref = input.invoice.number ?? String(input.invoice.id);
  if (!key) {
    return { url: `https://pay.mock/invoice/${ref}`, mocked: true };
  }
  const stripe = new Stripe(key);
  const price = await stripe.prices.create({
    currency: (input.invoice.currency || "EUR").toLowerCase(),
    unit_amount: input.invoice.total_cents,
    product_data: { name: input.productName ?? `Invoice ${ref}` },
  });
  const link = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });
  return { url: link.url, mocked: false };
}
