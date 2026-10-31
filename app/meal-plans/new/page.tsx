import { requireUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import { createMealPlanAction } from "../actions";

export default async function NewMealPlanPage({ searchParams }: { searchParams: { patientId?: string } }) {
  await requireUser();
  const patients = await listPatients();
  const preset = searchParams.patientId ? Number(searchParams.patientId) : null;
  const T: [string, string][] = [["target_kcal", "kcal"], ["target_protein_g", "Protein g"], ["target_carbs_g", "Carbs g"], ["target_fat_g", "Fat g"], ["target_fibre_g", "Fibre g"], ["target_salt_g", "Salt g"]];
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
      <h1>New meal plan</h1>
      <form action={createMealPlanAction} className="card stack" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 4 }}><span>Patient</span>
          <select name="patientId" defaultValue={preset ?? ""} required>
            <option value="" disabled>Choose a patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}><span>Title</span><input name="title" defaultValue="Meal plan" /></label>
        <span className="muted-xs">Daily targets (optional)</span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {T.map(([n, l]) => <label key={n} className="stack" style={{ gap: 3, width: 92 }}><span className="muted-xs">{l}</span><input name={n} type="number" step="0.1" min="0" /></label>)}
        </div>
        <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create &amp; open</button>
      </form>
    </div>
  );
}
