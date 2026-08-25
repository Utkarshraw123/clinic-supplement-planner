import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { importCsvAction } from "./actions";

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
      <div className="row-between">
        <h1>Import products</h1>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          Paste CSV with columns: <code>brand, name, package_size, form</code>. Ingredients and allergens are added per product afterwards. Re-importing creates duplicates.
        </p>
        <form action={importCsvAction} className="stack" style={{ gap: 10 }}>
          <textarea name="csv" rows={12} placeholder={"brand,name,package_size,form\nWild Nutrition,Food-Grown Magnesium,60 capsules,capsule"} required style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Import</button>
        </form>
      </div>
    </div>
  );
}
