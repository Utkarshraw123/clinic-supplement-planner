"use client";
import { useState, useTransition } from "react";
import type { TermType } from "@/lib/taxonomies";
import { savePatientAttributesAction, addTermAction } from "@/app/patients/actions";
import { toast } from "@/components/Toaster";

type Option = { id: number; label: string };
export type Section = { attr: string; term: TermType; label: string; hint: string; options: Option[]; selected: number[] };

// Multi-select clinical profile: each of the four sections is a set of toggleable
// chips (click to select any number), plus an inline "add" box for options that
// aren't in the taxonomy yet. Saving posts every selected term id.
export default function ClinicalProfileForm({ patientId, sections }: { patientId: number; sections: Section[] }) {
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
    const label = (drafts[rows[i].attr] ?? "").trim();
    if (!label) return;
    const res = await addTermAction(rows[i].term, label);
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const options = r.options.some((o) => o.id === res.id) ? r.options : [...r.options, res];
      const sel = new Set(r.sel); sel.add(res.id);
      return { ...r, options, sel };
    }));
    setDrafts((d) => ({ ...d, [rows[i].attr]: "" }));
  }

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.set("patientId", String(patientId));
      for (const r of rows) for (const id of r.sel) fd.append(`attr:${r.attr}`, String(id));
      await savePatientAttributesAction(fd);
      toast("Profile saved");
    });
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {rows.map((r, i) => (
          <div key={r.attr} className="stack" style={{ gap: 8 }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 500 }}>{r.label}</span>
              <span className="muted-xs">{r.hint}</span>
            </span>
            <div className="chip-group">
              {r.options.length === 0 && <span className="muted-xs">No options yet — add one below.</span>}
              {r.options.map((o) => (
                <label key={o.id} className={`chip-toggle${r.sel.has(o.id) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={r.sel.has(o.id)} onChange={() => toggle(i, o.id)} />
                  {o.label}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={drafts[r.attr] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.attr]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(i); } }}
                placeholder="Add another…"
                style={{ flex: 1, minWidth: 120 }}
              />
              <button type="button" className="btn--sm" onClick={() => addNew(i)}>Add</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn--primary" style={{ justifySelf: "start", width: "fit-content" }} onClick={save} disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
