// Letterhead colour themes for the prescription PDF. The logo/banner (header &
// footer images) and the Merriweather typeface are identical across every theme —
// only the accent palette applied to headings, the supplement table and links
// changes. Plain data with no @react-pdf import, so the settings UI can render
// swatches without pulling in the PDF renderer.

export type LetterheadTheme = {
  id: string;
  name: string;
  description: string;
  accent: string; // section titles, meta labels, table header, rules, buy links
  ink: string;    // body text
  muted: string;  // secondary / sub text
  rule: string;   // table row dividers
};

export const LETTERHEAD_THEMES: LetterheadTheme[] = [
  { id: "classic-gold", name: "Classic Gold", description: "The original — warm gold on cream.", accent: "#A17C3A", ink: "#2C2C2A", muted: "#6B6B63", rule: "#E3D9C6" },
  { id: "sage-green",   name: "Sage Green",   description: "Soft botanical green.",             accent: "#5E7355", ink: "#2B2E29", muted: "#6A6F64", rule: "#D9E1CF" },
  { id: "slate-blue",   name: "Slate Blue",   description: "Calm, clinical blue.",              accent: "#3F5A73", ink: "#262B30", muted: "#656E77", rule: "#D6DEE6" },
  { id: "dusty-rose",   name: "Dusty Rose",   description: "Warm, understated rose.",           accent: "#A65D66", ink: "#2E2A2B", muted: "#6E6467", rule: "#ECDADC" },
  { id: "charcoal",     name: "Charcoal",     description: "Minimal monochrome.",               accent: "#4A4A45", ink: "#232320", muted: "#6B6B64", rule: "#DAD6CE" },
];

export const DEFAULT_LETTERHEAD = "classic-gold";

// Resolve a stored id to a theme, always falling back to the default so a missing
// or unknown value never breaks PDF rendering.
export function getLetterheadTheme(id: string | null | undefined): LetterheadTheme {
  return LETTERHEAD_THEMES.find((t) => t.id === id) ?? LETTERHEAD_THEMES.find((t) => t.id === DEFAULT_LETTERHEAD)!;
}
