"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import * as P from "@/lib/products";
import type { TermType } from "@/lib/taxonomies";

export async function saveProductAction(formData: FormData) {
  await requireUser();
  const idRaw = formData.get("id");
  const input = {
    brandId: Number(formData.get("brandId")),
    name: String(formData.get("name")),
    packageSize: String(formData.get("packageSize") || ""),
    form: String(formData.get("form") || ""),
    defaultNote: String(formData.get("defaultNote") || ""),
  };
  if (idRaw) { await P.updateProduct(Number(idRaw), input); revalidatePath(`/catalog/products/${idRaw}`); }
  else { const id = await P.createProduct(input); redirect(`/catalog/products/${id}`); }
}

// Create a product with all details, tags and an optional supplier link in one submit.
export async function createFullProductAction(formData: FormData) {
  await requireUser();
  const id = await P.createProduct({
    brandId: Number(formData.get("brandId")),
    name: String(formData.get("name")),
    packageSize: String(formData.get("packageSize") || ""),
    form: String(formData.get("form") || ""),
    defaultNote: String(formData.get("defaultNote") || ""),
  });

  const tags: { termId: number; tagType: TermType }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("tag:")) {
      const tagType = key.slice(4) as TermType;
      for (const tid of String(value).split(",").filter(Boolean)) tags.push({ termId: Number(tid), tagType });
    }
  }
  if (tags.length) await P.setProductTags(id, tags);

  const supplierUrl = String(formData.get("supplierUrl") || "").trim();
  if (supplierUrl) {
    const label = String(formData.get("supplierLabel") || "").trim() || "Supplier";
    await P.addSupplierLink(id, label, supplierUrl);
  }

  redirect(`/catalog/products/${id}`);
}

export async function saveTagsAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  const tags: { termId: number; tagType: TermType }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("tag:")) {
      const tagType = key.slice(4) as TermType;
      for (const id of String(value).split(",").filter(Boolean)) tags.push({ termId: Number(id), tagType });
    }
  }
  await P.setProductTags(productId, tags);
  revalidatePath(`/catalog/products/${productId}`);
}

export async function addSupplierAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  await P.addSupplierLink(productId, String(formData.get("label")), String(formData.get("url")));
  revalidatePath(`/catalog/products/${productId}`);
}

export async function removeSupplierAction(formData: FormData) {
  await requireUser();
  await P.removeSupplierLink(Number(formData.get("linkId")));
  revalidatePath(`/catalog/products/${formData.get("productId")}`);
}

export async function addAlternativeAction(formData: FormData) {
  await requireUser();
  const productId = Number(formData.get("productId"));
  await P.linkAlternative(productId, Number(formData.get("altId")));
  revalidatePath(`/catalog/products/${productId}`);
}

export async function archiveProductAction(formData: FormData) {
  await requireUser();
  await P.archiveProduct(Number(formData.get("id")));
  redirect("/catalog");
}
