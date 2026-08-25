import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { searchProducts } from "@/lib/products";
import ProductSearch from "@/components/ProductSearch";

export default async function CatalogPage() {
  await requireUser();
  const initial = await searchProducts("");
  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontWeight: 500 }}>Catalog</h1>
        <nav style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <Link href="/catalog/brands">Brands</Link>
          <Link href="/catalog/import">Import</Link>
          <Link href="/catalog/new">Add product</Link>
        </nav>
      </div>
      <div style={{ marginTop: 16 }}>
        <ProductSearch initial={initial} />
      </div>
    </main>
  );
}
