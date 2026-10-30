import { upsertSubscription } from "@/lib/billing/subscriptions";

function tenantIdOf(obj: any): string | undefined {
  return obj?.metadata?.tenantId
    ?? obj?.subscription_details?.metadata?.tenantId
    ?? obj?.lines?.data?.[0]?.metadata?.tenantId;
}

// Map a Stripe subscription status to our subscription status.
function mapStatus(s: string): string {
  if (s === "unpaid") return "past_due";
  if (s === "incomplete" || s === "incomplete_expired") return "canceled";
  return s; // active | trialing | past_due | canceled pass through
}

export async function applyStripeEvent(event: { type: string; data: { object: any } }): Promise<{ handled: boolean; tenantId?: string }> {
  const obj = event.data.object;
  const tenantId = tenantIdOf(obj);

  switch (event.type) {
    case "checkout.session.completed": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({
        tenant_id: tenantId,
        status: "active",
        stripe_customer_id: obj.customer ?? null,
        stripe_subscription_id: obj.subscription ?? null,
      });
      return { handled: true, tenantId };
    }
    case "customer.subscription.updated": {
      if (!tenantId) return { handled: false };
      const cpe = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : undefined;
      await upsertSubscription({ tenant_id: tenantId, status: mapStatus(String(obj.status ?? "active")), current_period_end: cpe });
      return { handled: true, tenantId };
    }
    case "customer.subscription.deleted": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({ tenant_id: tenantId, status: "canceled" });
      return { handled: true, tenantId };
    }
    case "invoice.payment_failed": {
      if (!tenantId) return { handled: false };
      await upsertSubscription({ tenant_id: tenantId, status: "past_due" });
      return { handled: true, tenantId };
    }
    default:
      return { handled: false };
  }
}
