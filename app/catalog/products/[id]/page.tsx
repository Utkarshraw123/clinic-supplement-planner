import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProduct, searchProducts } from "@/lib/products";
import { listBrands } from "@/lib/brands";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { saveProductAction, saveTagsAction, addSupplierAction, removeSupplierAction, addAlternativeAction } from "@/app/catalog/products/actions";

const TAG_TYPES: TermType[] = ["ingredient","allergen","concern","diet","caution"];

export default async function ProductEditor({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const product = await getProduct(id);
  if (!product) notFound();
  const brands = await listBrands();
  const allTerms = await listTerms();
  const others = (await searchProducts("")).filter((p) => p.id !== id);

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", display: "grid", gap: 24 }}>
      <section>
        <h1 style={{ fontWeight: 500 }}>{product.name}</h1>
        <form action={saveProductAction} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="id" value={product.id} />
          <select name="brandId" defaultValue={product.brand_id}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input name="name" defaultValue={product.name} />
          <input name="packageSize" defaultValue={product.package_size ?? ""} placeholder="Package size" />
          <input name="form" defaultValue={product.form ?? ""} placeholder="Form" />
          <button type="submit">Save details</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Tags</h2>
        <form action={saveTagsAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="productId" value={product.id} />
          {TAG_TYPES.map((type) => {
            const selected = product.tags.filter((t) => t.tagType === type).map((t) => String(t.termId));
            return (
              <label key={type} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, textTransform: "capitalize" }}>{type}</span>
                <select name={`tag:${type}`} multiple defaultValue={selected}>
                  {allTerms.filter((t) => t.type === type).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            );
          })}
          <button type="submit">Save tags</button>
        </form>
        <p style={{ fontSize: 12, color: "#5F5E5A" }}>Missing a term? Add it in admin → taxonomies.</p>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Supplier links</h2>
        <ul>{product.suppliers.map((s) => (
          <li key={s.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <a href={s.url}>{s.label}</a>
            <form action={removeSupplierAction}><input type="hidden" name="linkId" value={s.id} /><input type="hidden" name="productId" value={product.id} /><button>Remove</button></form>
          </li>
        ))}</ul>
        <form action={addSupplierAction} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="productId" value={product.id} />
          <input name="label" placeholder="Supplier" required />
          <input name="url" placeholder="https://…" required />
          <button type="submit">Add</button>
        </form>
      </section>

      <section>
        <h2 style={{ fontWeight: 500, fontSize: 16 }}>Alternative formats</h2>
        <ul>{product.alternatives.map((a) => <li key={a.id}>{a.name}</li>)}</ul>
        <form action={addAlternativeAction} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="productId" value={product.id} />
          <select name="altId">{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button type="submit">Link alternative</button>
        </form>
      </section>
    </main>
  );
}
