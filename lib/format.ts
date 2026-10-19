// Pure text formatting shared by the PDF, the Word export and the Prepare preview.
// Dependency-free so client components can import it too.

// Course lengths print as "for 3 months"; options that aren't a length of time
// ("Finish off, no repeat", "See notes below") print exactly as chosen.
const VERBATIM_DURATIONS = [/^finish off/i, /^see notes/i];

export function formatDuration(d: string | null | undefined): string {
  const v = (d ?? "").trim();
  if (!v) return "";
  return VERBATIM_DURATIONS.some((re) => re.test(v)) ? v : `for ${v}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// The consultation date as it prints on the plan: "26 August 2026" — never a time.
// ISO dates (YYYY-MM-DD) are reformatted; anything else is returned unchanged.
export function formatConsultationDate(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return s;
  return `${Number(m[3])} ${month} ${m[1]}`;
}
