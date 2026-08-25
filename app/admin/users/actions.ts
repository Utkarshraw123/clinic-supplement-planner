"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current-user";
import { createUser, deleteUser } from "@/lib/users";

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

export async function removeUserAction(formData: FormData) {
  await requireAdmin();
  await deleteUser(Number(formData.get("id")));
  revalidatePath("/admin/users");
}
