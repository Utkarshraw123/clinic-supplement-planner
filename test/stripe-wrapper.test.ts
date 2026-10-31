import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("stripe", () => {
  return {
    default: class FakeStripe {
      checkout = { sessions: { create: vi.fn(async (args: any) => ({ url: `https://checkout/${args.metadata.tenantId}` })) } };
      billingPortal = { sessions: { create: vi.fn(async (args: any) => ({ url: `https://portal/${args.customer}` })) } };
      constructor(public key: string) {}
    },
  };
});

beforeEach(() => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; });

describe("stripe wrapper", () => {
  it("creates a checkout session URL carrying the tenant id", async () => {
    const { createCheckoutSession } = await import("@/lib/billing/stripe");
    const url = await createCheckoutSession({ tenantId: "acme", priceId: "price_1", customerEmail: "o@acme.test", successUrl: "s", cancelUrl: "c" });
    expect(url).toBe("https://checkout/acme");
  });
  it("creates a portal session URL for a customer", async () => {
    const { createPortalSession } = await import("@/lib/billing/stripe");
    const url = await createPortalSession({ customerId: "cus_1", returnUrl: "r" });
    expect(url).toBe("https://portal/cus_1");
  });
});
