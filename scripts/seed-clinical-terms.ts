/**
 * Seed the "Vegan but Fish Product" dietary option (#1) and a set of common medications
 * (#12) into the controlled taxonomies, so they're one-click selectable when setting
 * up a patient. Idempotent (taxonomy_terms is UNIQUE(type,label)). Run local + prod:
 *   npx tsx scripts/seed-clinical-terms.ts
 *
 * "Vegan but Fish Product" = a vegan patient who will still take fish/marine-sourced
 * supplements (omega-3 fish oil, marine collagen). lib/flagging.ts gives any such
 * "vegan + fish/marine" diet the marine exception, so those products don't warn.
 */
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";

const DIETS = ["Vegan but Fish Product"];

// Common medications a nutrition patient may be on — added to the "caution" taxonomy,
// which is the patient record's "Medications / conditions" picker.
const MEDICATIONS = [
  "Levothyroxine", "Liothyronine", "Metformin", "Warfarin", "Apixaban", "Aspirin",
  "Statin (e.g. atorvastatin)", "Beta-blocker (e.g. propranolol)", "ACE inhibitor (e.g. ramipril)",
  "PPI (e.g. omeprazole)", "SSRI antidepressant (e.g. sertraline)", "HRT (hormone replacement therapy)",
  "Combined contraceptive pill", "Progestogen-only pill", "Levonorgestrel IUS (Mirena)",
  "Thyroid medication", "Iron supplement (prescribed)", "Methotrexate", "Corticosteroid (e.g. prednisolone)",
  "Antibiotics (current course)",
];

async function main() {
  await runMigrations();
  let diets = 0, meds = 0;
  for (const d of DIETS) { await addTerm("diet", d); diets++; }
  for (const m of MEDICATIONS) { await addTerm("caution", m); meds++; }
  console.log(`Clinical terms seed: ${diets} diet option(s), ${meds} medication(s) ensured.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
