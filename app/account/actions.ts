"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getUserById, updateUserPassword } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";

const MIN_LENGTH = 10;

export async function changePasswordAction(formData: FormData) {
  const u = await requireUser();
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  const user = await getUserById(u.userId);
  if (!user) redirect("/account?error=notfound");
  if (!(await verifyPassword(current, user!.password_hash))) redirect("/account?error=current");
  if (next.length < MIN_LENGTH) redirect("/account?error=short");
  if (next !== confirm) redirect("/account?error=mismatch");

  await updateUserPassword(u.userId, next);
  redirect("/account?ok=1");
}
