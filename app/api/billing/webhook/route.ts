import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { applyStripeEvent } from "@/lib/billing/webhook";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  await applyStripeEvent(event as unknown as { type: string; data: { object: any } });
  return NextResponse.json({ received: true });
}
