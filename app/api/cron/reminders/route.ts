import { NextResponse } from "next/server";
import { runAllReminders } from "@/lib/reminders";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: no secret configured
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization");
  return bearer === `Bearer ${secret}` || url.searchParams.get("key") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await runAllReminders(24);
  return NextResponse.json({ ok: true, ...res });
}
