/**
 * Seed 25 realistic UAT patients with varied clinical attributes, so the tool
 * feels populated during user-acceptance testing. Attributes are chosen to
 * exercise the flagging engine against the Wild Nutrition catalogue:
 *   - allergy       -> allergen term  (HARD block on a matching product)
 *   - goal          -> concern term   (drives ranked suggestions)
 *   - diet          -> diet term      (soft-warn when a product isn't tagged)
 *   - med_condition -> caution term   (soft-warn)
 *
 * A couple of patients carry mushroom/fish allergies so the block is visible
 * (e.g. mushroom blocks Lion's Mane / Immune Support / the Cordyceps multis).
 *
 * Idempotent: skips any patient whose name already exists. Run with:
 *   npx tsx scripts/seed-uat-patients.ts
 */
import { runMigrations } from "@/scripts/migrate";
import { createPatient, setPatientAttributes, type AttrType } from "@/lib/patients";
import { addTerm, type TermType } from "@/lib/taxonomies";
import { query } from "@/lib/db";

type Attr = { type: TermType; attr: AttrType; label: string };
type UatPatient = { name: string; dob: string; attrs: Attr[] };

const A = (label: string): Attr => ({ type: "allergen", attr: "allergy", label });
const G = (label: string): Attr => ({ type: "concern", attr: "goal", label });
const D = (label: string): Attr => ({ type: "diet", attr: "diet", label });
const M = (label: string): Attr => ({ type: "caution", attr: "med_condition", label });

const PATIENTS: UatPatient[] = [
  { name: "Charlotte Bennett", dob: "1985-06-22", attrs: [G("Menopause"), G("Sleep"), D("Vegetarian")] },
  { name: "James Whitfield",   dob: "1978-11-03", attrs: [A("fish"), G("Energy"), G("Joint & Bone"), M("Hypertension")] },
  { name: "Priya Sharma",      dob: "1990-02-17", attrs: [A("mushroom"), G("Immunity"), G("Stress & Mood"), D("Vegan")] },
  { name: "Oliver Grant",      dob: "1982-09-30", attrs: [G("Fitness & Recovery"), G("General Wellbeing"), D("Dairy Free")] },
  { name: "Sophie Turner",     dob: "1995-04-12", attrs: [A("tree nuts"), G("Beauty"), G("Gut Health"), D("Gluten Free"), M("IBS")] },
  { name: "Aisha Khan",        dob: "1989-07-08", attrs: [G("Fertility"), G("Hormonal Health"), D("Halal"), M("Pregnancy")] },
  { name: "Daniel O'Connor",   dob: "1975-12-19", attrs: [A("milk"), G("Energy"), G("Joint & Bone"), M("Hypothyroidism")] },
  { name: "Emily Clarke",      dob: "1992-03-25", attrs: [A("mushroom"), A("fish"), G("Sleep"), G("Stress & Mood")] },
  { name: "Rebecca Nolan",     dob: "1986-10-05", attrs: [G("Perimenopause"), G("Hormonal Health"), D("Vegetarian"), M("Anaemia")] },
  { name: "Thomas Reid",       dob: "1980-01-28", attrs: [A("soya"), G("Gut Health"), G("Immunity")] },
  { name: "Hannah Foster",     dob: "1993-08-14", attrs: [A("mushroom"), G("Stress & Mood"), G("Sleep"), D("Vegetarian")] },
  { name: "Nathan Brooks",     dob: "1972-05-09", attrs: [G("Heart Health"), G("Joint & Bone"), M("Hypertension")] },
  { name: "Grace Sullivan",    dob: "1998-01-16", attrs: [A("gluten"), G("Skin Health"), G("Beauty"), D("Gluten Free"), M("IBS")] },
  { name: "Liam Patterson",    dob: "1984-11-27", attrs: [A("fish"), G("Energy"), G("Cognitive"), D("Dairy Free")] },
  { name: "Isabella Moretti",  dob: "1991-06-03", attrs: [G("Fertility"), G("Hormonal Health"), M("PCOS")] },
  { name: "Ethan Wallace",     dob: "1979-03-21", attrs: [A("peanut"), G("Fitness & Recovery"), G("General Wellbeing")] },
  { name: "Chloe Richardson",  dob: "1996-09-11", attrs: [A("egg"), G("Gut Health"), G("Immunity"), D("Vegan")] },
  { name: "Ryan Mitchell",     dob: "1970-12-02", attrs: [G("Joint & Bone"), G("Energy"), M("Osteoporosis")] },
  { name: "Amelia Hughes",     dob: "1988-04-18", attrs: [A("mushroom"), G("Perimenopause"), G("Sleep"), M("Migraine")] },
  { name: "Jacob Green",       dob: "1983-07-24", attrs: [A("shellfish"), G("Heart Health"), D("Pescatarian")] },
  { name: "Olivia Dawson",     dob: "1994-02-06", attrs: [G("Pregnancy" ), G("Hormonal Health"), D("Halal"), M("Pregnancy")] },
  { name: "Samuel Byrne",      dob: "1977-10-30", attrs: [A("milk"), G("Stress & Mood"), G("Cognitive"), M("Depression")] },
  { name: "Freya Lawson",      dob: "1990-12-13", attrs: [A("sesame"), G("Gut Health"), G("Beauty"), D("Gluten Free")] },
  { name: "Benjamin Cole",     dob: "1986-05-15", attrs: [G("Energy"), G("Immunity"), M("Diabetes")] },
  { name: "Matilda Rowe",      dob: "1997-08-29", attrs: [A("tree nuts"), A("gluten"), G("Menopause"), G("Hormonal Health"), D("Vegetarian")] },
];

async function main() {
  await runMigrations();

  const admin = (await query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"))[0];
  const createdBy = admin?.id;

  const existing = new Set(
    (await query<{ name: string }>("SELECT name FROM patients")).map((r) => r.name.trim().toLowerCase())
  );

  const termCache = new Map<string, number>();
  const term = async (type: TermType, label: string): Promise<number> => {
    const key = `${type}:${label.toLowerCase()}`;
    let id = termCache.get(key);
    if (id === undefined) { id = await addTerm(type, label); termCache.set(key, id); }
    return id;
  };

  let created = 0, skipped = 0;
  for (const p of PATIENTS) {
    if (existing.has(p.name.trim().toLowerCase())) { skipped++; continue; }
    const patientId = await createPatient({ name: p.name, dob: p.dob, createdBy });
    const attrs: { termId: number; attrType: AttrType }[] = [];
    for (const a of p.attrs) attrs.push({ termId: await term(a.type, a.label), attrType: a.attr });
    await setPatientAttributes(patientId, attrs);
    created++;
  }

  const total = (await query<{ n: number }>("SELECT COUNT(*) n FROM patients"))[0].n;
  console.log(`UAT patients seed: created ${created}, skipped ${skipped}. Patients now: ${total}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
