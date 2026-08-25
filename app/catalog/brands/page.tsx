import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { addBrandAction } from "./actions";

export default async function BrandsPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 560 }}>
      <div className="row-between">
        <h1>Brands</h1>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <div className="card">
        {brands.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>No brands yet.</p>}
        {brands.map((b) => (
          <div key={b.id} className="list-row">
            <span style={{ fontWeight: 500 }}>{b.name}</span>
            {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="muted-xs">{b.website}</a>}
          </div>
        ))}
        <form action={addBrandAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <input name="name" placeholder="Brand name" required />
          <input name="website" placeholder="https://…" />
          <button type="submit" className="btn--sm btn--primary">Add</button>
        </form>
      </div>
    </div>
  );
}
