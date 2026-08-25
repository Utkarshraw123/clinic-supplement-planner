"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { parseCatalogCsv, importRows } from "@/lib/import";

export async function importCsvAction(formData: FormData): Promise<void> {
  await requireUser();
  const csv = String(formData.get("csv") || "");
  const rows = parseCatalogCsv(csv);
  await importRows(rows);
  revalidatePath("/catalog");
}
