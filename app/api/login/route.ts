import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const user = await findUserByEmail(String(email ?? ""));
  if (!user || !(await verifyPassword(String(password ?? ""), user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = await signSession({ userId: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
