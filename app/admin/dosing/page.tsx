import { requireAdmin } from "@/lib/auth/current-user";
import { listDosingPresets } from "@/lib/dosing";
import PageHeader from "@/components/PageHeader";
import { addDosingPresetAction, updateDosingPresetAction, deleteDosingPresetAction } from "@/app/admin/dosing/actions";

export default async function DosingPresetsPage() {
  await requireAdmin();
  const presets = await listDosingPresets();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Practice settings"
        title="Dosing presets"
        subtitle="The ready-made dosing instructions offered on every plan item. Edit the wording, add your own, or remove ones you don't use."
      />

      <div className="card">
        <form action={addDosingPresetAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="label" placeholder="Short name, e.g. Bedtime x2" required style={{ minWidth: 180 }} />
          <input name="text" placeholder="Wording on the plan, e.g. 2 capsules at bedtime" required style={{ flex: 1, minWidth: 240 }} />
          <button type="submit" className="btn--primary">Add</button>
        </form>
        <p className="muted-xs" style={{ marginTop: 8 }}>The short name appears in the dropdown; the wording is what prints on the plan.</p>
      </div>

      <div className="card">
        {presets.length === 0 ? (
          <p className="muted">No dosing presets yet. Add the instructions you use most.</p>
        ) : presets.map((p) => (
          <div key={p.id} className="list-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <form action={updateDosingPresetAction} style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={p.id} />
              <input name="label" defaultValue={p.label} required style={{ minWidth: 160 }} />
              <input name="text" defaultValue={p.text} required style={{ flex: 1, minWidth: 220 }} />
              <button type="submit" className="btn--sm">Save</button>
            </form>
            <form action={deleteDosingPresetAction}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn--sm">Remove</button>
            </form>
          </div>
        ))}
      </div>
      <p className="muted-xs">Removing a preset hides it from new choices. Plans that already use it keep their wording.</p>
    </div>
  );
}
