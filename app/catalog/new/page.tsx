import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listBrands } from "@/lib/brands";
import { listTerms } from "@/lib/taxonomies";
import { listSnippets } from "@/lib/notes";
import ProductForm from "@/components/ProductForm";

export default async function NewProductPage() {
  await requireUser();
  const brands = await listBrands();
  const terms = (await listTerms()).map((t) => ({ id: t.id, label: t.label, type: t.type as string }));
  const snippets = await listSnippets("supplement");
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <div className="row-between">
        <div>
          <h1>New product</h1>
          <p className="muted" style={{ marginTop: 2 }}>Paste a product link to auto-fill the details and allergens, then confirm.</p>
        </div>
        <Link href="/catalog" className="muted">← Catalog</Link>
      </div>
      <div className="card">
        <ProductForm brands={brands} terms={terms} snippets={snippets} />
      </div>
    </div>
  );
}
