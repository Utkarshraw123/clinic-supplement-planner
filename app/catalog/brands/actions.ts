"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { createBrand } from "@/lib/brands";
import { addBrandCode, deleteBrandCode, setDefaultBrandCode } from "@/lib/brand-codes";

export async function addBrandAction(formData: FormData) {
  await requireUser();
  await createBrand({ name: String(formData.get("name")), website: String(formData.get("website") || "") });
  revalidatePath("/catalog/brands");
}

export async function addBrandCodeAction(formData: FormData) {
  await requireUser();
  await addBrandCode(Number(formData.get("brandId")), String(formData.get("code") || ""), formData.get("makeDefault") === "on");
  revalidatePath("/catalog/brands");
}

export async function deleteBrandCodeAction(formData: FormData) {
  await requireUser();
  await deleteBrandCode(Number(formData.get("id")));
  revalidatePath("/catalog/brands");
}

export async function setDefaultBrandCodeAction(formData: FormData) {
  await requireUser();
  await setDefaultBrandCode(Number(formData.get("id")));
  revalidatePath("/catalog/brands");
}
