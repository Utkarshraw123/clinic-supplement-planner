import { query, execute } from "@/lib/db";

// Generic starter data for a brand-new clinic. No brands/products — the clinic
// uploads its own supplement library. Seeds into the ACTIVE tenant DB; idempotent.
const DOSING = [
  { label: "1 capsule with breakfast", text: "Take 1 capsule with breakfast." },
  { label: "2 capsules with food", text: "Take 2 capsules with food." },
  { label: "1 capsule with evening meal", text: "Take 1 capsule with your evening meal." },
  { label: "As directed", text: "Take as directed by your practitioner." },
];

const SNIPPETS = [
  { text: "Take away from medications by at least 2 hours.", category: "supplement" },
  { text: "Best taken with food to support absorption.", category: "supplement" },
  { text: "Review at your next consultation.", category: "general" },
];

export async function seedStarterData(): Promise<void> {
  for (const d of DOSING) {
    const exists = await query<{ id: number }>("SELECT id FROM dosing_presets WHERE label = ?", [d.label]);
    if (exists.length === 0) await execute("INSERT INTO dosing_presets (label, text) VALUES (?, ?)", [d.label, d.text]);
  }
  for (const s of SNIPPETS) {
    const exists = await query<{ id: number }>("SELECT id FROM note_snippets WHERE text = ?", [s.text]);
    if (exists.length === 0) await execute("INSERT INTO note_snippets (text, category) VALUES (?, ?)", [s.text, s.category]);
  }
}
