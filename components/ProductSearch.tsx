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
      <input
        placeholder="Search all products — vitamin D, magnesium…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        style={{ width: "100%" }}
      />
      <ul style={{ marginTop: 12 }}>
        {hits.map((h) => (
          <li key={h.id} style={{ padding: "8px 0", borderBottom: "0.5px solid #ddd" }}>
            <Link href={`/catalog/products/${h.id}`}>{h.name}</Link>
            <span style={{ color: "#5F5E5A", fontSize: 13 }}> · {h.brand_name}{h.form ? ` · ${h.form}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
