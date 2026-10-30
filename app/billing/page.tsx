import { requireUser } from "@/lib/auth/current-user";
import { getSubscription, subscriptionAccess } from "@/lib/billing/subscriptions";
import { startCheckoutAction } from "./actions";

export default async function BillingPage() {
  const u = await requireUser();
  const sub = await getSubscription(u.tenantId);
  const access = subscriptionAccess(sub);
  return (
    <main style={{ maxWidth: 560, margin: "64px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Subscription</h1>
      <p style={{ color: "#555" }}>
        Status: <strong>{sub?.status ?? "none"}</strong>
        {sub?.trial_ends_at ? ` · trial ends ${new Date(sub.trial_ends_at).toLocaleDateString()}` : ""}
      </p>
      {access.allowed ? (
        <p style={{ marginTop: 16 }}>Your subscription is active. <a href="/dashboard">Go to dashboard →</a></p>
      ) : (
        <p style={{ marginTop: 16 }}>Your access is paused ({access.reason}).</p>
      )}
      {!access.allowed && process.env.STRIPE_PRICE_SOLO ? (
        <form action={startCheckoutAction} style={{ marginTop: 16 }}>
          <button type="submit" style={{ padding: "10px 16px" }}>Subscribe to continue</button>
        </form>
      ) : null}
    </main>
  );
}
