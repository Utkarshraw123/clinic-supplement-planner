"use client";
import { useState } from "react";
import Link from "next/link";
import { deleteProtocolAction } from "@/app/protocols/actions";

type Protocol = { id: number; name: string; description: string | null; itemCount: number };

export default function ProtocolSearch({ protocols }: { protocols: Protocol[] }) {
  const [term, setTerm] = useState("");
  const q = term.trim().toLowerCase();
  const hits = q
    ? protocols.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
    : protocols;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div style={{ position: "relative", maxWidth: 420 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-muted)", fontSize: 15 }}>⌕</span>
        <input
          placeholder="Search protocols by name…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ paddingLeft: 32 }}
          aria-label="Search protocols"
        />
      </div>

      {hits.length === 0 ? (
        <div className="card"><p className="muted">No protocols match “{term}”.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {hits.map((p) => (
            <div key={p.id} className="card stack" style={{ gap: 8 }}>
              <div className="row-between">
                <h2 style={{ fontSize: 17 }}>{p.name}</h2>
                <span className="badge badge--neutral">{p.itemCount} {p.itemCount === 1 ? "item" : "items"}</span>
              </div>
              {p.description && <p className="muted" style={{ fontSize: 13 }}>{p.description}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Link href={`/protocols/${p.id}`} className="btn btn--sm btn--primary">Edit</Link>
                <form action={deleteProtocolAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn--sm">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
