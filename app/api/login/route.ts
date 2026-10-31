import { NextResponse } from "next/server";
import { resolveLogin } from "@/lib/auth/login";
import { signSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const session = await resolveLogin(String(email ?? ""), String(password ?? ""));
  if (!session) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = await signSession(session);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
