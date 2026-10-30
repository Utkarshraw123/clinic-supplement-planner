import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { applyStripeEvent } from "@/lib/billing/webhook";
import { getSubscription } from "@/lib/billing/subscriptions";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
  await upsertTenant({ id: "acme", name: "Acme", dbUrl: "file:unused.db" });
}
beforeEach(resetControl);

describe("applyStripeEvent", () => {
  it("activates on checkout.session.completed and stores stripe ids", async () => {
    const res = await applyStripeEvent({
      type: "checkout.session.completed",
      data: { object: { metadata: { tenantId: "acme" }, customer: "cus_1", subscription: "sub_1" } },
    });
    expect(res).toEqual({ handled: true, tenantId: "acme" });
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("active");
    expect(sub?.stripe_customer_id).toBe("cus_1");
    expect(sub?.stripe_subscription_id).toBe("sub_1");
  });

  it("sets past_due on invoice.payment_failed and canceled on subscription.deleted", async () => {
    await applyStripeEvent({ type: "checkout.session.completed", data: { object: { metadata: { tenantId: "acme" }, customer: "c", subscription: "s" } } });
    await applyStripeEvent({ type: "invoice.payment_failed", data: { object: { subscription_details: { metadata: { tenantId: "acme" } } } } });
    expect((await getSubscription("acme"))?.status).toBe("past_due");
    await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { metadata: { tenantId: "acme" } } } });
    expect((await getSubscription("acme"))?.status).toBe("canceled");
  });

  it("ignores unrelated events", async () => {
    const res = await applyStripeEvent({ type: "ping", data: { object: {} } });
    expect(res.handled).toBe(false);
  });
});
