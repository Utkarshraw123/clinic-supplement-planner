import { runMigrations } from "@/scripts/migrate";
import { query, execute } from "@/lib/db";

const PRESETS = [
  { label: "1 capsule with breakfast", text: "Take 1 capsule with breakfast." },
  { label: "2 capsules with food", text: "Take 2 capsules with food." },
  { label: "1 capsule with evening meal", text: "Take 1 capsule with your evening meal." },
  { label: "1 teaspoon daily", text: "Take 1 teaspoon daily." },
  { label: "As directed", text: "Take as directed by your practitioner." },
];

async function main() {
  await runMigrations();
  for (const p of PRESETS) {
    const existing = await query<{ id: number }>("SELECT id FROM dosing_presets WHERE label = ?", [p.label]);
    if (existing.length === 0) await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [p.label, p.text]);
  }
  console.log("dosing presets seeded");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
