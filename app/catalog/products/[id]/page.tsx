import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProduct, searchProducts } from "@/lib/products";
import { listBrands } from "@/lib/brands";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { saveProductAction, saveTagsAction, addSupplierAction, removeSupplierAction, addAlternativeAction } from "@/app/catalog/products/actions";
import EnrichAssist from "@/components/EnrichAssist";

const TAG_TYPES: TermType[] = ["ingredient", "allergen", "concern", "diet", "caution"];

export default async function ProductEditor({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const product = await getProduct(id);
  if (!product) notFound();
  const brands = await listBrands();
  const allTerms = await listTerms();
  const others = (await searchProducts("")).filter((p) => p.id !== id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row-between">
        <div>
          <h1>{product.name}</h1>
          <p className="muted" style={{ marginTop: 2 }}>{product.brand_name}{product.form ? ` · ${product.form}` : ""}</p>
        </div>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Details</h2>
        <form action={saveProductAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="id" value={product.id} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="stack" style={{ gap: 5 }}><span>Brand</span>
              <select name="brandId" defaultValue={product.brand_id}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
            <label className="stack" style={{ gap: 5 }}><span>Name</span><input name="name" defaultValue={product.name} /></label>
            <label className="stack" style={{ gap: 5 }}><span>Package size</span><input name="packageSize" defaultValue={product.package_size ?? ""} placeholder="e.g. 60 capsules" /></label>
            <label className="stack" style={{ gap: 5 }}><span>Form</span><input name="form" defaultValue={product.form ?? ""} placeholder="capsule / liquid / powder" /></label>
          </div>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save details</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Tags</h2>
        <p className="muted" style={{ marginBottom: 12 }}>The matching backbone — allergens and ingredients drive safety flags. Missing a term? Add it in admin → taxonomies.</p>
        <EnrichAssist />
        <form action={saveTagsAction} className="stack" style={{ gap: 14 }}>
          <input type="hidden" name="productId" value={product.id} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {TAG_TYPES.map((type) => {
              const selected = product.tags.filter((t) => t.tagType === type).map((t) => String(t.termId));
              return (
                <label key={type} className="stack" style={{ gap: 5 }}>
                  <span style={{ textTransform: "capitalize" }}>{type}</span>
                  <select name={`tag:${type}`} multiple defaultValue={selected}>
                    {allTerms.filter((t) => t.type === type).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save tags</button>
        </form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Supplier links</h2>
          <div>
            {product.suppliers.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>No suppliers yet.</p>}
            {product.suppliers.map((s) => (
              <div key={s.id} className="list-row">
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                <form action={removeSupplierAction}>
                  <input type="hidden" name="linkId" value={s.id} /><input type="hidden" name="productId" value={product.id} />
                  <button className="btn--sm">Remove</button>
                </form>
              </div>
            ))}
          </div>
          <form action={addSupplierAction} style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input type="hidden" name="productId" value={product.id} />
            <input name="label" placeholder="Supplier" required style={{ flex: "0 0 40%" }} />
            <input name="url" placeholder="https://…" required />
            <button type="submit" className="btn--sm">Add</button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Alternative formats</h2>
          <div>
            {product.alternatives.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>No alternatives linked.</p>}
            {product.alternatives.map((a) => <div key={a.id} className="list-row">{a.name}</div>)}
          </div>
          <form action={addAlternativeAction} style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input type="hidden" name="productId" value={product.id} />
            <select name="altId">{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <button type="submit" className="btn--sm">Link</button>
          </form>
        </div>
      </div>
    </div>
  );
}
