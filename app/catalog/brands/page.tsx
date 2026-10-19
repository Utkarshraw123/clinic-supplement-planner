import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { listAllBrandCodes } from "@/lib/brand-codes";
import { addBrandAction, addBrandCodeAction, deleteBrandCodeAction, setDefaultBrandCodeAction } from "./actions";

export default async function BrandsPage() {
  await requireUser();
  const [brands, codesByBrand] = await Promise.all([listBrands(), listAllBrandCodes()]);
  const tiny = { height: 22, padding: "0 6px" } as const;
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
      <div className="row-between">
        <h1>Brands</h1>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <p className="muted-xs" style={{ margin: 0 }}>
        Each brand&apos;s discount codes appear in the Order code dropdown on that brand&apos;s plan items.
        The default code is pre-selected; you can pick another code or &ldquo;No code&rdquo; on any item.
      </p>
      <div className="card">
        {brands.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>No brands yet.</p>}
        {brands.map((b) => {
          const codes = codesByBrand.get(b.id) ?? [];
          return (
            <div key={b.id} className="stack" style={{ gap: 8, padding: "12px 0", borderBottom: "1px solid var(--sand-border)" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{b.name}</div>
                {b.website && <a href={b.website} target="_blank" rel="noreferrer" className="muted-xs">{b.website}</a>}
              </div>
              {codes.length === 0 ? <p className="muted-xs" style={{ margin: 0 }}>No discount codes yet.</p> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {codes.map((c) => (
                    <span key={c.id} className="badge badge--neutral" style={{ display: "inline-flex", gap: 6, alignItems: "center", height: "auto", padding: "4px 8px" }}>
                      <strong>{c.code}</strong>
                      {c.isDefault ? <span className="muted-xs">default</span> : (
                        <form action={setDefaultBrandCodeAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn--sm" style={tiny} title="Pre-select this code on plan items">Make default</button>
                        </form>
                      )}
                      <form action={deleteBrandCodeAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn--sm" style={tiny} title="Remove this code">✕</button>
                      </form>
                    </span>
                  ))}
                </div>
              )}
              <form action={addBrandCodeAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input type="hidden" name="brandId" value={b.id} />
                <input name="code" placeholder="New code, e.g. LORNA10" required style={{ maxWidth: 200 }} />
                <label className="muted-xs" style={{ display: "flex", gap: 5, alignItems: "center", whiteSpace: "nowrap" }}>
                  <input type="checkbox" name="makeDefault" style={{ width: 14, height: 14, minHeight: 0, margin: 0, padding: 0, flex: "0 0 auto" }} /> make default
                </label>
                <button type="submit" className="btn--sm">Add code</button>
              </form>
            </div>
          );
        })}
        <form action={addBrandAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <input name="name" placeholder="Brand name" required />
          <input name="website" placeholder="https://…" />
          <button type="submit" className="btn--sm btn--primary">Add</button>
        </form>
      </div>
    </div>
  );
}
