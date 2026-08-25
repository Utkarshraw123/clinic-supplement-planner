"use client";
import { useState } from "react";
import { suggestFromUrlAction } from "@/app/catalog/products/enrich-actions";

export default function EnrichAssist() {
  const [url, setUrl] = useState("");
  const [terms, setTerms] = useState<{ id: number; label: string; type: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setError(""); setTerms([]); setLoading(true);
    const res = await suggestFromUrlAction(url);
    setLoading(false);
    if (res.ok) { setTerms(res.terms); if (res.terms.length === 0) setError("No known ingredient or allergen terms found on that page."); }
    else setError(res.error);
  }

  return (
    <div style={{ background: "var(--brand-tint-2)", border: "1px solid var(--brand-tint)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a product page URL to scan for known terms" />
        <button type="button" className="btn--sm btn--primary" onClick={run} disabled={loading || !url}>{loading ? "Scanning…" : "Scan"}</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</p>}
      {terms.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {terms.map((t) => <span key={t.id} className="badge badge--ok">{t.label} · {t.type}</span>)}
          </div>
          <p className="muted-xs" style={{ marginTop: 6 }}>Confirm by selecting these in the tag lists below, then save tags.</p>
        </div>
      )}
    </div>
  );
}
