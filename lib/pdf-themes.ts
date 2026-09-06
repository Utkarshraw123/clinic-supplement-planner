// Letterhead themes for the prescription PDF. The logo, all header/footer text and
// the body are IDENTICAL across every theme (original gold artwork, unchanged) — a
// theme only sets the BACKGROUND colour behind the header and footer banners. Plain
// data with no @react-pdf import, so the settings UI can render swatches without
// pulling in the PDF renderer.

export type LetterheadTheme = {
  id: string;
  name: string;
  description: string;
  bg: string | null; // header/footer background; null = plain white (the original look)
};

export const LETTERHEAD_THEMES: LetterheadTheme[] = [
  { id: "original",   name: "Original (white)", description: "No background — the original look.", bg: null },
  { id: "sage-green", name: "Sage",             description: "Soft green header & footer.",       bg: "#EAF0E4" },
  { id: "slate-blue", name: "Slate",            description: "Soft blue header & footer.",         bg: "#E7EDF3" },
  { id: "dusty-rose", name: "Rose",             description: "Soft rose header & footer.",         bg: "#F5E9EB" },
  { id: "warm-sand",  name: "Warm Sand",        description: "Soft warm cream header & footer.",   bg: "#F4EEE2" },
];

export const DEFAULT_LETTERHEAD = "original";

// Resolve a stored id to a theme, always falling back to the default so a missing
// or unknown value never breaks PDF rendering.
export function getLetterheadTheme(id: string | null | undefined): LetterheadTheme {
  return LETTERHEAD_THEMES.find((t) => t.id === id) ?? LETTERHEAD_THEMES.find((t) => t.id === DEFAULT_LETTERHEAD)!;
}
