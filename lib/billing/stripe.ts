import Stripe from "stripe";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY must be set");
  _stripe = new Stripe(key);
  return _stripe;
}

export async function createCheckoutSession(input: {
  tenantId: string; priceId: string; customerEmail: string; successUrl: string; cancelUrl: string;
}): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: { metadata: { tenantId: input.tenantId } },
    metadata: { tenantId: input.tenantId },
  });
  if (!session.url) throw new Error("Stripe checkout: no url");
  return session.url;
}

export async function createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return session.url;
}
