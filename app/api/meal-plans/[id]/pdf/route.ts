import { requireUser } from "@/lib/auth/current-user";
import { getMealPlan } from "@/lib/meal-plans";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { renderMealPlanPdf } from "@/lib/meal-plan-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const tree = await getMealPlan(Number(params.id));
  if (!tree) return new Response("not found", { status: 404 });
  const settings = await getClinicSettings();
  const patient = tree.plan.patient_id ? await getPatient(tree.plan.patient_id) : null;
  const pdf = await renderMealPlanPdf(tree, settings, patient?.name ?? "Patient");
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="meal-plan-${tree.plan.id}.pdf"` } });
}
