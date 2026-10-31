"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createCheckoutSession } from "@/lib/billing/stripe";

export async function startCheckoutAction(): Promise<void> {
  const u = await requireUser();
  const priceId = process.env.STRIPE_PRICE_SOLO;
  if (!priceId) throw new Error("STRIPE_PRICE_SOLO not configured");
  const base = process.env.APP_BASE_URL || "http://localhost:3200";
  const url = await createCheckoutSession({
    tenantId: u.tenantId,
    priceId,
    customerEmail: `${u.userId}@tenant-${u.tenantId}.local`, // placeholder; replaced by the owner's email once captured on the account
    successUrl: `${base}/dashboard`,
    cancelUrl: `${base}/billing`,
  });
  redirect(url);
}
