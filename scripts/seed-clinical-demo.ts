import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import { createPatient, setPatientAttributes, getPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { searchProducts } from "@/lib/products";

async function main() {
  await runMigrations();
  const mushroom = await addTerm("allergen", "mushroom");
  const sleep = await addTerm("concern", "sleep");
  const patientId = await createPatient({ name: "Emma Hartley", dob: "1988-03-14" });
  await setPatientAttributes(patientId, [
    { termId: mushroom, attrType: "allergy" },
    { termId: sleep, attrType: "goal" },
  ]);
  // magnesium is tagged with mushroom allergen by seed-demo -> should BLOCK
  const mag = (await searchProducts("Magnesium"))[0];
  const planId = await getOrCreateDraftPlan(patientId);
  if (mag) await addPlanItem(planId, mag.id);
  const p = await getPatient(patientId);
  console.log("clinical demo: patient", patientId, "plan", planId, "attrs", p!.attributes.length, "magnesium item added:", !!mag);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
