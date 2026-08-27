"use client";
import { saveItemFieldsAction } from "@/app/plan/actions";
import { DURATION_OPTIONS } from "@/lib/durations";

type Preset = { id: number; label: string };

export default function PlanItemFields({
  itemId,
  patientId,
  presets,
  currentText,
  currentDuration,
  currentOrderCode,
  currentNote,
}: {
  itemId: number;
  patientId: number;
  presets: Preset[];
  currentText: string;
  currentDuration: string | null;
  currentOrderCode: string | null;
  currentNote: string | null;
}) {
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
        <span className="field__label">Order code</span>
        <input name="orderCode" placeholder="Discount / coupon code" defaultValue={currentOrderCode ?? ""} />
      </label>

      <label className="field field--full">
        <span className="field__label">Note for this product <span className="field__hint">appears on the guide</span></span>
        <input name="note" placeholder="e.g. only take at night" defaultValue={currentNote ?? ""} />
      </label>

      <div className="rx-actions">
        <button type="submit" className="btn--primary btn--sm">Save details</button>
      </div>
    </form>
  );
}
