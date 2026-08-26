import { query } from "../lib/db";
import { createSnippet } from "../lib/notes";

const STARTERS = [
  "Only take at night",
  "Take with food",
  "Take on an empty stomach",
  "Add to water",
  "Don't take with levothyroxine (leave 4 hours)",
  "Take away from tea and coffee",
];

async function main() {
  const existing = new Set((await query<{ text: string }>("SELECT text FROM note_snippets")).map((r) => r.text));
  let added = 0;
  for (const t of STARTERS) {
    if (!existing.has(t)) { await createSnippet(t); added++; }
  }
  console.log(`seed-notes: ${added} snippet(s) added (${STARTERS.length - added} already present)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
