"use client";
import { useState } from "react";
import AddToPlanButton from "@/components/AddToPlanButton";

type CatalogItem = { id: number; name: string; brand_name: string; form: string | null };

export default function AddProductSearch({
  planId,
  patientId,
  catalog,
}: {
  planId: number;
  patientId: number;
  catalog: CatalogItem[];
}) {
  const [term, setTerm] = useState("");
  const q = term.trim().toLowerCase();
  const hits = (q
    ? catalog.filter((c) => c.name.toLowerCase().includes(q) || c.brand_name.toLowerCase().includes(q))
    : catalog
  ).slice(0, 60);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-muted)", fontSize: 15 }}>⌕</span>
        <input
          placeholder="Search products — name or brand…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ paddingLeft: 32 }}
          aria-label="Search products to add"
        />
      </div>
      {hits.length === 0 ? (
        <p className="muted" style={{ padding: "10px 4px" }}>No products match “{term}”.</p>
      ) : (
        hits.map((c) => (
          <div key={c.id} className="list-row">
            <span style={{ fontSize: 14 }}>{c.name} <span className="muted-xs">· {c.brand_name}{c.form ? ` · ${c.form}` : ""}</span></span>
            <AddToPlanButton planId={planId} patientId={patientId} productId={c.id} />
          </div>
        ))
      )}
    </div>
  );
}
