import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { saveProductAction } from "@/app/catalog/products/actions";

export default async function NewProductPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 520 }}>
      <div className="row-between">
        <h1>New product</h1>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <div className="card">
        <form action={saveProductAction} className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 5 }}><span>Brand</span>
            <select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <label className="stack" style={{ gap: 5 }}><span>Name</span><input name="name" placeholder="Product name" required /></label>
          <label className="stack" style={{ gap: 5 }}><span>Package size</span><input name="packageSize" placeholder="e.g. 60 capsules" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Form</span><input name="form" placeholder="capsule / liquid / powder" /></label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create product</button>
        </form>
      </div>
    </div>
  );
}
