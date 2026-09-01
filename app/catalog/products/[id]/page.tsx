import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProduct } from "@/lib/products";
import { listBrands } from "@/lib/brands";
import { listTerms, type TermType } from "@/lib/taxonomies";
import { listSnippets } from "@/lib/notes";
import { saveProductAction, addSupplierAction, removeSupplierAction } from "@/app/catalog/products/actions";
import EnrichAssist from "@/components/EnrichAssist";
import SnippetTextarea from "@/components/SnippetTextarea";
import ProductTagsForm, { type TagSection } from "@/components/ProductTagsForm";
import RemoveProductButton from "@/components/RemoveProductButton";
import Toaster from "@/components/Toaster";

const TAG_META: { type: TermType; label: string; hint: string }[] = [
  { type: "ingredient", label: "Ingredients", hint: "Active nutrients · safety flags" },
  { type: "allergen", label: "Allergens", hint: "Hard-blocks matching allergies" },
  { type: "concern", label: "Health concerns", hint: "Drives suggestions" },
  { type: "diet", label: "Dietary suitability", hint: "Filters unsuitable" },
  { type: "caution", label: "Cautions", hint: "Raises warnings" },
];

export default async function ProductEditor({ params }: { params: { id: string } }) {
  await requireUser();
  const id = Number(params.id);
  const product = await getProduct(id);
  if (!product) notFound();
  const brands = await listBrands();
  const allTerms = await listTerms();
  const snippets = await listSnippets("supplement");

  const tagSections: TagSection[] = TAG_META.map(({ type, label, hint }) => ({
    type, label, hint,
    options: allTerms.filter((t) => t.type === type).map((t) => ({ id: t.id, label: t.label })),
    selected: product.tags.filter((t) => t.tagType === type).map((t) => t.termId),
  }));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Toaster />
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
            <label className="stack" style={{ gap: 5 }}><span>Brand <span className="muted-xs">· type a new one or pick existing</span></span>
              <input name="brandName" list="brandOptions" defaultValue={product.brand_name} autoComplete="off" />
              <datalist id="brandOptions">{brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
            </label>
            <label className="stack" style={{ gap: 5 }}><span>Name</span><input name="name" defaultValue={product.name} /></label>
            <label className="stack" style={{ gap: 5 }}><span>Package size</span><input name="packageSize" defaultValue={product.package_size ?? ""} placeholder="e.g. 60 capsules" /></label>
            <label className="stack" style={{ gap: 5 }}><span>Form</span><input name="form" defaultValue={product.form ?? ""} placeholder="capsule / liquid / powder" /></label>
          </div>
          <label className="stack" style={{ gap: 5 }}>
            <span>Description <span className="muted-xs">· a short line shown under this product on the client's guide (editable/removable per patient)</span></span>
            <textarea name="description" rows={2} defaultValue={product.description ?? ""} placeholder="e.g. Food-grown magnesium; supports sleep & muscle relaxation" />
          </label>
          <label className="stack" style={{ gap: 5 }}>
            <span>Standard note <span className="muted-xs">· auto-appears on the plan whenever this product is used (editable/removable per patient)</span></span>
            <SnippetTextarea name="defaultNote" defaultValue={product.default_note ?? ""} snippets={snippets} rows={2} placeholder="e.g. Only take at night" />
          </label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Save details</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Tags</h2>
        <p className="muted" style={{ marginBottom: 12 }}>The matching backbone — allergens and ingredients drive safety flags. Click to toggle; add a missing term inline.</p>
        <EnrichAssist />
        <ProductTagsForm productId={product.id} sections={tagSections} />
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

      </div>

      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <h2 style={{ marginBottom: 4, color: "var(--danger)" }}>Danger zone</h2>
        <div className="row-between" style={{ alignItems: "center", gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Remove this product from the catalogue. It will no longer appear in the catalogue
            or when building plans. Plans already sent are unaffected.
          </p>
          <RemoveProductButton productId={product.id} productName={product.name} />
        </div>
      </div>
    </div>
  );
}
