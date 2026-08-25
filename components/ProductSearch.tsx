"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Hit = { id: number; name: string; brand_name: string; form: string|null; package_size: string|null };

export default function ProductSearch({ initial }: { initial: Hit[] }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>(initial);
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(term)}`);
      setHits(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [term]);
  return (
    <div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-muted)", fontSize: 15 }}>⌕</span>
        <input
          placeholder="Search all products — vitamin D, magnesium…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ paddingLeft: 32 }}
        />
      </div>
      <div style={{ marginTop: 6 }}>
        {hits.length === 0 && <p className="muted" style={{ padding: "12px 4px" }}>No products match “{term}”.</p>}
        {hits.map((h) => (
          <div key={h.id} className="list-row">
            <Link href={`/catalog/products/${h.id}`} style={{ fontWeight: 500, color: "var(--ink)" }}>{h.name}</Link>
            <span className="muted-xs">{h.brand_name}{h.form ? ` · ${h.form}` : ""}{h.package_size ? ` · ${h.package_size}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
