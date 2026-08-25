import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { searchProducts } from "@/lib/products";
import ProductSearch from "@/components/ProductSearch";

export default async function CatalogPage() {
  await requireUser();
  const initial = await searchProducts("");
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row-between">
        <div>
          <h1>Catalog</h1>
          <p className="muted" style={{ marginTop: 2 }}>{initial.length} products across all brands</p>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <Link href="/catalog/brands" className="muted" style={{ alignSelf: "center" }}>Brands</Link>
          <Link href="/catalog/import"><button className="btn--sm">Import</button></Link>
          <Link href="/catalog/new"><button className="btn--sm btn--primary">Add product</button></Link>
        </nav>
      </div>
      <div className="card">
        <ProductSearch initial={initial} />
      </div>
    </div>
  );
}
