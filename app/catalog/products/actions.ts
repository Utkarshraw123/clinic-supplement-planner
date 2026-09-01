"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import * as P from "@/lib/products";
import { findOrCreateBrand } from "@/lib/brands";
import { addTerm, type TermType } from "@/lib/taxonomies";

// Add a taxonomy term inline from the product tag editor (idempotent).
export async function addTagTermAction(termType: TermType, label: string): Promise<{ id: number; label: string }> {
  await requireUser();
  const clean = label.trim();
  if (!clean) throw new Error("A label is required");
  const id = await addTerm(termType, clean);
  return { id, label: clean };
}

// Prefer a typed brand name (create-if-new); fall back to a selected brandId.
async function resolveBrandId(fd: FormData): Promise<number> {
  const name = String(fd.get("brandName") || "").trim();
  if (name) return findOrCreateBrand(name);
  return Number(fd.get("brandId"));
}

export async function saveProductAction(formData: FormData) {
  await requireUser();
  const idRaw = formData.get("id");
  const input = {
    brandId: await resolveBrandId(formData),
    name: String(formData.get("name")),
    description: String(formData.get("description") || ""),
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
    brandId: await resolveBrandId(formData),
    name: String(formData.get("name")),
    description: String(formData.get("description") || ""),
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

// Remove a product from the catalogue (soft delete via archive). It disappears
// from the catalogue and plan builder; past plans/snapshots are untouched.
export async function removeProductAction(id: number) {
  await requireUser();
  await P.archiveProduct(id);
  revalidatePath("/catalog");
  redirect("/catalog");
}
