"use client";
import { useState } from "react";
import { saveItemFieldsAction } from "@/app/plan/actions";
import { DURATION_OPTIONS, SIZE_OPTIONS } from "@/lib/durations";
import { ORDER_DEFAULT, ORDER_NONE, formValueFromStored } from "@/lib/order-codes";

type Preset = { id: number; label: string };

export default function PlanItemFields({
  itemId,
  patientId,
  presets,
  notePresets,
  currentText,
  currentDuration,
  currentOrderCode,
  currentSize,
  currentNote,
  brandCodes,
}: {
  itemId: number;
  patientId: number;
  presets: Preset[];
  brandCodes: { code: string; isDefault: boolean }[];
  notePresets: string[];
  currentText: string;
  currentDuration: string | null;
  currentOrderCode: string | null;
  currentSize: string | null;
  currentNote: string | null;
}) {
  const [note, setNote] = useState(currentNote ?? "");
  const defaultCode = brandCodes.find((c) => c.isDefault)?.code ?? null;
  const storedCode = currentOrderCode?.trim() ?? null;
  // A code saved on this item that has since been removed from the brand's list stays
  // selectable, so saving the form never silently drops it.
  const unlistedCode = storedCode && !brandCodes.some((c) => c.code === storedCode) ? storedCode : null;
  return (
    <form action={saveItemFieldsAction} className="rx-fields">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="patientId" value={patientId} />

      <label className="field">
        <span className="field__label">Dosing preset</span>
        <select name="presetId" defaultValue="">
          <option value="">— preset —</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Custom dosing</span>
        <input name="customText" placeholder="e.g. 1 capsule with breakfast" defaultValue={currentText} />
      </label>

      <label className="field">
        <span className="field__label">Duration</span>
        <select name="duration" defaultValue={currentDuration ?? ""}>
          <option value="">— duration —</option>
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Pack size</span>
        <select name="size" defaultValue={currentSize ?? ""}>
          <option value="">— product default —</option>
          {SIZE_OPTIONS.map((sz) => (
            <option key={sz} value={sz}>{sz}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Order code <span className="field__hint">from this brand&apos;s codes</span></span>
        <select name="orderCode" defaultValue={formValueFromStored(currentOrderCode)}>
          <option value={ORDER_DEFAULT}>{defaultCode ? `Brand default (${defaultCode})` : "Brand default (none set)"}</option>
          {brandCodes.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
          {unlistedCode && <option value={unlistedCode}>{unlistedCode} (no longer listed)</option>}
          <option value={ORDER_NONE}>No code</option>
        </select>
      </label>

      {notePresets.length > 0 && (
        <label className="field">
          <span className="field__label">Insert a note <span className="field__hint">adds to the note below</span></span>
          <select
            value=""
            onChange={(e) => {
              const pick = e.target.value;
              if (!pick) return;
              // Append (don't overwrite) so presets and custom text stack up.
              setNote((prev) => {
                const s = prev.trim();
                if (!s) return pick;
                if (s.split(/\.\s*|\n/).map((x) => x.trim()).includes(pick.trim())) return s; // avoid dupes
                return /[.!?]$/.test(s) ? `${s} ${pick}` : `${s}. ${pick}`;
              });
            }}
          >
            <option value="">— pick a ready-made note —</option>
            {notePresets.map((n, i) => (
              <option key={i} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}

      <label className="field field--full">
        <span className="field__label">Note for this product <span className="field__hint">appears on the guide · pick above (adds on) or type your own</span></span>
        <textarea name="note" rows={2} placeholder="e.g. only take at night" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="rx-actions">
        <button type="submit" className="btn--primary btn--sm">Save details</button>
      </div>
    </form>
  );
}
