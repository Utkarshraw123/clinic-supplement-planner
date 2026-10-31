import { requireUser } from "@/lib/auth/current-user";
import { listTemplates } from "@/lib/meal-plans";
import { listPatients } from "@/lib/patients";
import { applyTemplateAction } from "../actions";

export default async function TemplatesPage() {
  await requireUser();
  const templates = await listTemplates();
  const patients = await listPatients();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
      <h1>Meal-plan templates</h1>
      {templates.length === 0 ? <div className="card"><p className="muted">No templates yet. Save a plan as a template from its page.</p></div> : templates.map((t) => (
        <div key={t.id} className="card row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>{t.title ?? "Template"}</span>
          <form action={applyTemplateAction.bind(null, t.id)} className="row" style={{ gap: 8 }}>
            <select name="patientId" required defaultValue=""><option value="" disabled>Apply to…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn--primary btn--sm">Apply</button>
          </form>
        </div>
      ))}
    </div>
  );
}
