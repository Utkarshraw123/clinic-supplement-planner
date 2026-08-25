import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { addBrandAction } from "./actions";

export default async function BrandsPage() {
  await requireUser();
  const brands = await listBrands();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Brands</h1>
      <ul>{brands.map((b) => <li key={b.id}>{b.name}</li>)}</ul>
      <form action={addBrandAction} style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <input name="name" placeholder="Brand name" required />
        <input name="website" placeholder="https://…" />
        <button type="submit">Add brand</button>
      </form>
    </main>
  );
}
