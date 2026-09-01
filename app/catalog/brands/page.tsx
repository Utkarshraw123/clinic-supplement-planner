import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { addBrandAction, setBrandPromoAction } from "./actions";

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
          <div key={b.id} className="user-row">
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontWeight: 500 }}>{b.name}</div>
              {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="muted-xs">{b.website}</a>}
            </div>
            <form action={setBrandPromoAction} className="user-edit" style={{ flex: "0 0 auto" }}>
              <input type="hidden" name="id" value={b.id} />
              <label className="field">
                <span className="field__label">Promo code <span className="field__hint">one per brand</span></span>
                <input name="promo_code" defaultValue={b.promo_code ?? ""} placeholder="e.g. LORNA10" />
              </label>
              <button type="submit" className="btn--sm">Save</button>
            </form>
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
