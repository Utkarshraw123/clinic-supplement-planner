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
    <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a product page URL to scan" style={{ flex: 1 }} />
        <button type="button" onClick={run} disabled={loading || !url}>{loading ? "Scanning…" : "Scan"}</button>
      </div>
      {error && <p style={{ fontSize: 12, color: "#A32D2D" }}>{error}</p>}
      {terms.length > 0 && (
        <p style={{ fontSize: 13 }}>
          Found: {terms.map((t) => `${t.label} (${t.type})`).join(", ")}.
          <span style={{ color: "#5F5E5A" }}> Confirm by selecting them in the tag lists below, then save tags.</span>
        </p>
      )}
    </div>
  );
}
