import { requireUser } from "@/lib/auth/current-user";
import { importCsvAction } from "./actions";

export default async function ImportPage() {
  await requireUser();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Import products</h1>
      <p style={{ fontSize: 13, color: "#5F5E5A" }}>
        Paste CSV with columns: brand, name, package_size, form. Ingredients and allergens are added
        per product afterwards. Re-importing creates duplicates.
      </p>
      <form action={importCsvAction} style={{ display: "grid", gap: 8 }}>
        <textarea name="csv" rows={12} placeholder="brand,name,package_size,form" required />
        <button type="submit">Import</button>
      </form>
    </main>
  );
}
