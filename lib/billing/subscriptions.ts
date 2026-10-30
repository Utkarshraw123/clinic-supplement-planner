import { getControlDb } from "@/lib/db";

export type SubscriptionRow = {
  tenant_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: string | null;
  seats: number | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

const ALLOWED_STATUSES = new Set(["active", "comp", "past_due"]);

export async function getSubscription(tenantId: string): Promise<SubscriptionRow | null> {
  const rs = await getControlDb().execute({ sql: "SELECT * FROM subscriptions WHERE tenant_id = ?", args: [tenantId] });
  const r = rs.rows[0];
  if (!r) return null;
  return {
    tenant_id: String(r.tenant_id),
    stripe_customer_id: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
    stripe_subscription_id: r.stripe_subscription_id ? String(r.stripe_subscription_id) : null,
    tier: r.tier ? String(r.tier) : null,
    seats: r.seats != null ? Number(r.seats) : null,
    status: String(r.status),
    trial_ends_at: r.trial_ends_at ? String(r.trial_ends_at) : null,
    current_period_end: r.current_period_end ? String(r.current_period_end) : null,
  };
}

export async function upsertSubscription(input: Partial<SubscriptionRow> & { tenant_id: string; status: string }): Promise<void> {
  await getControlDb().execute({
    sql: `INSERT INTO subscriptions (tenant_id, stripe_customer_id, stripe_subscription_id, tier, seats, status, trial_ends_at, current_period_end)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id) DO UPDATE SET
            stripe_customer_id=COALESCE(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
            stripe_subscription_id=COALESCE(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
            tier=COALESCE(excluded.tier, subscriptions.tier),
            seats=COALESCE(excluded.seats, subscriptions.seats),
            status=excluded.status,
            trial_ends_at=COALESCE(excluded.trial_ends_at, subscriptions.trial_ends_at),
            current_period_end=COALESCE(excluded.current_period_end, subscriptions.current_period_end)`,
    args: [
      input.tenant_id,
      input.stripe_customer_id ?? null,
      input.stripe_subscription_id ?? null,
      input.tier ?? null,
      input.seats ?? null,
      input.status,
      input.trial_ends_at ?? null,
      input.current_period_end ?? null,
    ],
  });
}

export async function startTrial(tenantId: string, days = 14): Promise<void> {
  const ends = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await upsertSubscription({ tenant_id: tenantId, status: "trialing", trial_ends_at: ends });
}

// Pure gate: decide whether a tenant may use the app from its subscription row.
export function subscriptionAccess(sub: SubscriptionRow | null, now: Date = new Date()): { allowed: boolean; reason: string } {
  if (!sub) return { allowed: false, reason: "no_subscription" };
  if (ALLOWED_STATUSES.has(sub.status)) return { allowed: true, reason: sub.status };
  if (sub.status === "trialing") {
    if (sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > now.getTime()) {
      return { allowed: true, reason: "trialing" };
    }
    return { allowed: false, reason: "trial_expired" };
  }
  return { allowed: false, reason: sub.status };
}
