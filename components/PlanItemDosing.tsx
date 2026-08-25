"use client";
import { saveDosingAction } from "@/app/plan/actions";

type Preset = { id: number; label: string };

export default function PlanItemDosing({ itemId, patientId, presets, currentText }: { itemId: number; patientId: number; presets: Preset[]; currentText: string }) {
  return (
    <form action={saveDosingAction} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="patientId" value={patientId} />
      <select name="presetId" defaultValue="">
        <option value="">— preset —</option>
        {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <input name="customText" placeholder="or custom instruction" defaultValue={currentText} style={{ flex: 1, minWidth: 180 }} />
      <button type="submit">Save dosing</button>
    </form>
  );
}
