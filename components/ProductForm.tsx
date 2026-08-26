"use client";
import { useState } from "react";
import { enrichProductAction } from "@/app/catalog/products/enrich-actions";
import { createFullProductAction } from "@/app/catalog/products/actions";
import SnippetTextarea from "@/components/SnippetTextarea";

type Brand = { id: number; name: string };
type Term = { id: number; label: string; type: string };
type Snippet = { id: number; text: string };
const TAG_TYPES = ["ingredient", "allergen", "concern", "diet", "caution"] as const;

export default function ProductForm({ brands, terms, snippets }: { brands: Brand[]; terms: Term[]; snippets: Snippet[] }) {
  const [name, setName] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [form, setForm] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scannedAllergens, setScannedAllergens] = useState<string[]>([]);

  const termsByType = (type: string) => terms.filter((t) => t.type === type);
  const sel = (type: string) => selected[type] ?? [];
  const setSel = (type: string, ids: string[]) => setSelected((s) => ({ ...s, [type]: ids }));

  async function scan() {
    setError(""); setNotice(""); setScannedAllergens([]); setScanning(true);
    const res = await enrichProductAction(url);
    setScanning(false);
    if (!res.ok) { setError(res.error); return; }
    const d = res.data;
    if (d.name) setName(d.name);
    if (d.packageSize) setPackageSize(d.packageSize);
    if (d.form) setForm(d.form);

    // Union scanned tag ids into the current selection, per type.
    const next: Record<string, string[]> = { ...selected };
    for (const type of TAG_TYPES) {
      const ids = d.terms.filter((t) => t.type === type).map((t) => String(t.id));
      if (ids.length) next[type] = Array.from(new Set([...(next[type] ?? []), ...ids]));
    }
    setSelected(next);
    const allergens = d.terms.filter((t) => t.type === "allergen").map((t) => t.label);
    setScannedAllergens(allergens);

    const filled: string[] = [];
    if (d.name) filled.push("name");
    if (d.packageSize) filled.push("size");
    if (d.form) filled.push("form");
    filled.push(`${d.terms.length} tag${d.terms.length === 1 ? "" : "s"}`);
    setNotice(`Pre-filled from the page: ${filled.join(", ")}. Review everything below, then create.`);
  }

  return (
    <form action={createFullProductAction} className="stack" style={{ gap: 16 }}>
      {/* Scan-a-link assist */}
      <div style={{ background: "var(--sage-tint)", border: "1px solid #D4DCC2", borderRadius: 10, padding: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>Product / supplier link — scan to auto-fill</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input name="supplierUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://brand.com/product" />
          <button type="button" className="btn--sm btn--primary" onClick={scan} disabled={scanning || !url}>{scanning ? "Scanning…" : "Scan link"}</button>
        </div>
        <input type="hidden" name="supplierLabel" value={url ? URLHost(url) : ""} />
        {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
        {notice && <p style={{ fontSize: 12, color: "var(--ok)", marginTop: 8 }}>{notice}</p>}
        {scannedAllergens.length > 0 && (
          <p style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted-xs">Allergens detected:</span>
            {scannedAllergens.map((a) => <span key={a} className="badge badge--danger">{a}</span>)}
          </p>
        )}
        <p className="muted-xs" style={{ marginTop: 8 }}>The link is saved as a supplier link. Auto-filled values are suggestions — confirm them before saving.</p>
      </div>

      {/* Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="stack" style={{ gap: 5 }}><span>Brand <span className="muted-xs">· type a new one or pick existing</span></span>
          <input name="brandName" list="brandOptions" required placeholder="e.g. Wild Nutrition" autoComplete="off" />
          <datalist id="brandOptions">{brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
        </label>
        <label className="stack" style={{ gap: 5 }}><span>Name</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" required />
        </label>
        <label className="stack" style={{ gap: 5 }}><span>Package size</span>
          <input name="packageSize" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} placeholder="e.g. 60 capsules" />
        </label>
        <label className="stack" style={{ gap: 5 }}><span>Form</span>
          <input name="form" value={form} onChange={(e) => setForm(e.target.value)} placeholder="capsule / liquid / powder" />
        </label>
      </div>

      <label className="stack" style={{ gap: 5 }}>
        <span>Description <span className="muted-xs">· a short line shown under this product on the client's guide (editable/removable per patient)</span></span>
        <textarea name="description" rows={2} placeholder="e.g. Food-grown magnesium; supports sleep & muscle relaxation" />
      </label>

      {/* Standard note — auto-appears whenever this product is used on a plan */}
      <label className="stack" style={{ gap: 5 }}>
        <span>Standard note <span className="muted-xs">· auto-appears on the plan whenever this product is used (editable/removable per patient)</span></span>
        <SnippetTextarea name="defaultNote" snippets={snippets} rows={2} placeholder="e.g. Only take at night" />
      </label>

      {/* Tags */}
      <div>
        <label style={{ display: "block", marginBottom: 8 }}>
          Tags — <span style={{ color: "var(--danger)" }}>allergens</span> and ingredients drive the safety flags when prescribing.
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {TAG_TYPES.map((type) => (
            <label key={type} className="stack" style={{ gap: 5 }}>
              <span style={{ textTransform: "capitalize" }}>{type}</span>
              <select
                name={`tag:${type}`}
                multiple
                value={sel(type)}
                onChange={(e) => setSel(type, Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {termsByType(type).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="muted-xs" style={{ marginTop: 6 }}>Hold ⌘/Ctrl to select multiple. Missing a term? Add it in Admin → Taxonomies.</p>
      </div>

      <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create product</button>
    </form>
  );
}

// Small helper: derive a readable supplier label (the host) from a URL, safely.
function URLHost(u: string): string {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return "Supplier"; }
}
