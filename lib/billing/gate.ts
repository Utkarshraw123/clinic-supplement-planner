import { redirect } from "next/navigation";
import { getSubscription, subscriptionAccess } from "@/lib/billing/subscriptions";

export async function checkTenantAccess(tenantId: string): Promise<{ allowed: boolean; reason: string }> {
  const sub = await getSubscription(tenantId);
  return subscriptionAccess(sub);
}

// Server-side gate for protected pages: send the user to the billing wall when
// their tenant's subscription does not allow access.
export async function requireActiveSubscription(tenantId: string): Promise<void> {
  const { allowed } = await checkTenantAccess(tenantId);
  if (!allowed) redirect("/billing");
}
