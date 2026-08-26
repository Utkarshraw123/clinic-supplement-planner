import { runMigrations } from "@/scripts/migrate";
import { query, execute } from "../lib/db";
import { createSnippet, type SnippetCategory } from "../lib/notes";

const STARTERS: { text: string; category: SnippetCategory }[] = [
  // Supplement / product notes
  { text: "Only take at night", category: "supplement" },
  { text: "Take with food", category: "supplement" },
  { text: "Take on an empty stomach", category: "supplement" },
  { text: "Add to water", category: "supplement" },
  { text: "Don't take with levothyroxine (leave 4 hours)", category: "supplement" },
  { text: "Take away from tea and coffee", category: "supplement" },
  // Lifestyle recommendations (premade options for the guide)
  { text: "Aim for 7–8 hours of quality sleep each night", category: "lifestyle" },
  { text: "Include 20–30 minutes of movement daily", category: "lifestyle" },
  { text: "Prioritise daily stress-reduction — breathwork, walking or yoga", category: "lifestyle" },
  { text: "Get 15–20 minutes of morning daylight to support your circadian rhythm", category: "lifestyle" },
  { text: "Reduce screen time in the hour before bed", category: "lifestyle" },
  // Dietary recommendations
  { text: "Aim for 2 litres of water throughout the day", category: "dietary" },
  { text: "Include protein with every meal", category: "dietary" },
  { text: "Eat a wide variety of colourful vegetables — aim for 30 plants a week", category: "dietary" },
  { text: "Reduce refined sugar and ultra-processed foods", category: "dietary" },
  { text: "Limit caffeine to before midday", category: "dietary" },
  { text: "Include oily fish or an omega-3 source 2–3 times a week", category: "dietary" },
];

async function main() {
  await runMigrations();
  // Backfill: older snippets with no category become "supplement".
  await execute("UPDATE note_snippets SET category = 'supplement' WHERE category IS NULL OR category = ''");

  const existing = new Set((await query<{ text: string }>("SELECT text FROM note_snippets")).map((r) => r.text));
  let added = 0;
  for (const s of STARTERS) {
    if (!existing.has(s.text)) { await createSnippet(s.text, s.category); added++; }
  }
  console.log(`seed-notes: ${added} snippet(s) added (${STARTERS.length - added} already present)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
