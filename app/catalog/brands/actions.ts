"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { createBrand, setBrandPromoCode } from "@/lib/brands";

export async function addBrandAction(formData: FormData) {
  await requireUser();
  await createBrand({ name: String(formData.get("name")), website: String(formData.get("website") || "") });
  revalidatePath("/catalog/brands");
}

export async function setBrandPromoAction(formData: FormData) {
  await requireUser();
  await setBrandPromoCode(Number(formData.get("id")), String(formData.get("promo_code") || ""));
  revalidatePath("/catalog/brands");
}
