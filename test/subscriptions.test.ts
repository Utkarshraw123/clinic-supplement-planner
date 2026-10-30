import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControlDb } from "@/lib/db";
import { upsertTenant } from "@/lib/control-users";
import { upsertSubscription, getSubscription, startTrial, subscriptionAccess } from "@/lib/billing/subscriptions";

async function resetControl() {
  const db = getControlDb();
  await db.execute("DROP TABLE IF EXISTS subscriptions");
  const sql = readFileSync(join(process.cwd(), "lib/control-schema.sql"), "utf8");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
  await upsertTenant({ id: "acme", name: "Acme", dbUrl: "file:unused.db" });
}

beforeEach(resetControl);

describe("subscriptions", () => {
  it("startTrial creates a trialing row that getSubscription reads back", async () => {
    await startTrial("acme", 14);
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("trialing");
    expect(sub?.trial_ends_at).toBeTruthy();
  });

  it("upsertSubscription updates status in place", async () => {
    await startTrial("acme");
    await upsertSubscription({ tenant_id: "acme", status: "active", tier: "solo" });
    const sub = await getSubscription("acme");
    expect(sub?.status).toBe("active");
    expect(sub?.tier).toBe("solo");
  });

  describe("subscriptionAccess (pure)", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const base = { tenant_id: "x", stripe_customer_id: null, stripe_subscription_id: null, tier: null, seats: null, current_period_end: null };
    it("blocks a missing subscription", () => {
      expect(subscriptionAccess(null, now).allowed).toBe(false);
    });
    it("allows active, comp, and in-date trialing; blocks expired trial, canceled", () => {
      expect(subscriptionAccess({ ...base, status: "active", trial_ends_at: null }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "comp", trial_ends_at: null }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "trialing", trial_ends_at: "2026-02-10T00:00:00Z" }, now).allowed).toBe(true);
      expect(subscriptionAccess({ ...base, status: "trialing", trial_ends_at: "2026-01-20T00:00:00Z" }, now).allowed).toBe(false);
      expect(subscriptionAccess({ ...base, status: "canceled", trial_ends_at: null }, now).allowed).toBe(false);
    });
    it("allows past_due as a grace state", () => {
      expect(subscriptionAccess({ ...base, status: "past_due", trial_ends_at: null }, now).allowed).toBe(true);
    });
  });
});
