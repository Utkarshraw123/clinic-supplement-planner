import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { searchProducts } from "@/lib/products";
import ProductSearch from "@/components/ProductSearch";
import PageHeader from "@/components/PageHeader";

export default async function CatalogPage() {
  await requireUser();
  const initial = await searchProducts("");
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Product library"
        title="Catalog"
        subtitle={`${initial.length} products across all brands`}
        actions={
          <>
            <Link href="/catalog/brands" className="btn btn--on-dark">Brands</Link>
            <a href="/api/export/products" className="btn btn--on-dark">Export CSV</a>
            <Link href="/catalog/import" className="btn btn--on-dark">Import</Link>
            <Link href="/catalog/new" className="btn btn--accent">+ Add product</Link>
          </>
        }
      />
      <div className="card">
        <ProductSearch initial={initial} />
      </div>
    </div>
  );
}
