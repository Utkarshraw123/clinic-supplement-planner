"use client";
import { useState, useTransition } from "react";
import type { TermType } from "@/lib/taxonomies";
import { saveTagsAction, addTagTermAction } from "@/app/catalog/products/actions";
import { toast } from "@/components/Toaster";

type Option = { id: number; label: string };
export type TagSection = { type: TermType; label: string; hint: string; options: Option[]; selected: number[] };

// Colour cue per tag type (allergen/ingredient hard-block; concern drives suggestions; etc.)
const DOT: Record<string, string> = { allergen: "danger", ingredient: "info", concern: "ok", diet: "accent", caution: "warn" };

function Check() {
  return (
    <svg className="chip-toggle__check" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Multi-select tag editor for a product — same chip UI as the patient clinical profile,
// with inline "add a term" and a Save that posts every selected term id per type.
export default function ProductTagsForm({ productId, sections }: { productId: number; sections: TagSection[] }) {
  const [rows, setRows] = useState(() =>
    sections.map((s) => ({ ...s, options: [...s.options], sel: new Set(s.selected) }))
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function toggle(i: number, id: number) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const sel = new Set(r.sel);
      sel.has(id) ? sel.delete(id) : sel.add(id);
      return { ...r, sel };
    }));
  }

  async function addNew(i: number) {
    const label = (drafts[rows[i].type] ?? "").trim();
    if (!label) return;
    const res = await addTagTermAction(rows[i].type, label);
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const options = r.options.some((o) => o.id === res.id) ? r.options : [...r.options, res];
      const sel = new Set(r.sel); sel.add(res.id);
      return { ...r, options, sel };
    }));
    setDrafts((d) => ({ ...d, [rows[i].type]: "" }));
  }

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.set("productId", String(productId));
      for (const r of rows) for (const id of r.sel) fd.append(`tag:${r.type}`, String(id));
      await saveTagsAction(fd);
      toast("Tags saved");
    });
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="attr-grid">
        {rows.map((r, i) => (
          <div key={r.type} className="attr-section">
            <div className="attr-section__head">
              <span className="attr-section__title">
                <span className={`attr-dot attr-dot--${DOT[r.type] ?? "info"}`} />
                {r.label}
              </span>
              <span className="muted-xs">{r.hint}</span>
            </div>
            <div className="chip-group">
              {r.options.length === 0 && <span className="muted-xs">No options yet — add one below.</span>}
              {r.options.map((o) => {
                const on = r.sel.has(o.id);
                return (
                  <label key={o.id} className={`chip-toggle${on ? " is-on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(i, o.id)} />
                    {on && <Check />}
                    {o.label}
                  </label>
                );
              })}
            </div>
            <div className="attr-add">
              <input
                value={drafts[r.type] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.type]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(i); } }}
                placeholder="Add another…"
                aria-label={`Add a ${r.label.toLowerCase()} term`}
              />
              <button type="button" onClick={() => addNew(i)}>+ Add</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn--primary" style={{ justifySelf: "start", width: "fit-content" }} onClick={save} disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save tags"}
      </button>
    </div>
  );
}
