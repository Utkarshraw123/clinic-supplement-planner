"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createUser, deleteUser, updateUser } from "@/lib/users";

export async function addUserAction(formData: FormData) {
  await requireAdmin();
  await createUser({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    role: (String(formData.get("role")) === "admin" ? "admin" : "team"),
    name: String(formData.get("name")),
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  const roleRaw = String(formData.get("role")) === "admin" ? "admin" : "team";
  // Guard against self-lockout: an admin can't demote their own account.
  const role: "admin" | "team" = id === me.userId && roleRaw !== "admin" ? "admin" : roleRaw;
  await updateUser(id, {
    name: String(formData.get("name")),
    email: String(formData.get("email")),
    role,
  });
  revalidatePath("/admin/users");
}

export async function removeUserAction(formData: FormData) {
  await requireAdmin();
  await deleteUser(Number(formData.get("id")));
  revalidatePath("/admin/users");
}
