"use client";
import { useRef, useState } from "react";
import { mergeSection } from "@/lib/text-merge";

type Snippet = { id: number; text: string };

// A textarea plus a row of one-click "snippet" chips. Clicking a chip inserts the
// reusable phrase at the cursor, so common notes aren't retyped. Submits as `name`.
export default function SnippetTextarea({
  name, defaultValue, snippets, rows = 6, placeholder, blocks, blocksLabel,
}: {
  name: string;
  defaultValue?: string;
  snippets: Snippet[];
  rows?: number;
  placeholder?: string;
  blocks?: { id: number; name: string; body: string }[];
  blocksLabel?: string;
}) {
  const [val, setVal] = useState(defaultValue ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(text: string) {
    const el = ref.current;
    const start = el ? el.selectionStart : val.length;
    const end = el ? el.selectionEnd : val.length;
    const before = val.slice(0, start);
    const after = val.slice(end);
    const sep = before && !/[\s]$/.test(before) ? " " : "";
    const next = before + sep + text + after;
    setVal(next);
    requestAnimationFrame(() => {
      if (el) { el.focus(); const pos = (before + sep + text).length; el.setSelectionRange(pos, pos); }
    });
  }

  return (
    <div>
      {blocks && blocks.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const b = blocks.find((x) => String(x.id) === e.target.value);
            if (b) setVal((v) => mergeSection(v, b.body));
          }}
          aria-label={blocksLabel ?? "Insert a template"}
          style={{ marginBottom: 8 }}
        >
          <option value="">{blocksLabel ?? "Insert a template…"}</option>
          {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <textarea ref={ref} name={name} value={val} onChange={(e) => setVal(e.target.value)} rows={rows} placeholder={placeholder} style={{ minHeight: rows * 22 }} />
      {snippets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {snippets.map((s) => (
            <button key={s.id} type="button" className="snippet-chip" onClick={() => insert(s.text)} title="Insert at cursor">+ {s.text}</button>
          ))}
        </div>
      )}
    </div>
  );
}
