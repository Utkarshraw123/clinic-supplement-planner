"use client";
import { useState, useTransition } from "react";
import type { TermType } from "@/lib/taxonomies";
import { savePatientAttributesAction, addTermAction } from "@/app/patients/actions";
import { toast } from "@/components/Toaster";

type Option = { id: number; label: string };
export type Section = { attr: string; term: TermType; label: string; hint: string; options: Option[]; selected: number[] };

// Small colour cue per section, matching what the tag does clinically.
const DOT: Record<string, string> = { allergy: "danger", goal: "ok", diet: "accent", med_condition: "warn" };

function Check() {
  return (
    <svg className="chip-toggle__check" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    // If the section already offers this term (ignoring case/spacing), select that one
    // instead of creating a near-duplicate — keeps the taxonomy clean and steers the
    // clinician onto the canonical term products are actually tagged with.
    const existing = rows[i].options.find((o) => o.label.trim().toLowerCase() === label.toLowerCase());
    if (existing) {
      setRows((prev) => prev.map((r, idx) => {
        if (idx !== i) return r;
        const sel = new Set(r.sel); sel.add(existing.id);
        return { ...r, sel };
      }));
      setDrafts((d) => ({ ...d, [rows[i].attr]: "" }));
      return;
    }
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
      <div className="attr-grid">
        {rows.map((r, i) => (
          <div key={r.attr} className="attr-section">
            <div className="attr-section__head">
              <span className="attr-section__title">
                <span className={`attr-dot attr-dot--${DOT[r.attr] ?? "ok"}`} />
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
                value={drafts[r.attr] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.attr]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(i); } }}
                placeholder="Add another…"
                aria-label={`Add a ${r.label.toLowerCase()} option`}
              />
              <button type="button" onClick={() => addNew(i)}>+ Add</button>
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
