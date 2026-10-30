"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signupClinic, SignupError } from "@/lib/tenancy/signup";
import { signSession } from "@/lib/auth/session";

export async function signupAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const clinicName = String(formData.get("clinicName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!clinicName || !ownerName || !email || password.length < 6) {
    return { error: "All fields required; password at least 6 characters." };
  }
  let result;
  try {
    result = await signupClinic({ clinicName, ownerName, email, password });
  } catch (e) {
    if (e instanceof SignupError) return { error: e.message };
    throw e;
  }
  const token = await signSession({ userId: result.tenantUserId, tenantId: result.tenantId, role: "admin", name: ownerName });
  cookies().set("sess", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/onboarding");
}
