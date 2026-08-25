import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { saveProductAction } from "@/app/catalog/products/actions";

export default async function NewProductPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>New product</h1>
      <form action={saveProductAction} style={{ display: "grid", gap: 8 }}>
        <select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input name="name" placeholder="Product name" required />
        <input name="packageSize" placeholder="e.g. 60 capsules" />
        <input name="form" placeholder="e.g. capsule / liquid / powder" />
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
