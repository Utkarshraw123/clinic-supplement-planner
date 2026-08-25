import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, type SessionPayload } from "@/lib/auth/session";

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = cookies().get("sess")?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(): Promise<SessionPayload> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
