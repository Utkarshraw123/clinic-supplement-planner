"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { createBrand } from "@/lib/brands";

export async function addBrandAction(formData: FormData) {
  await requireUser();
  await createBrand({ name: String(formData.get("name")), website: String(formData.get("website") || "") });
  revalidatePath("/catalog/brands");
}
