// Controlled list offered in the plan builder's Duration dropdown (blank = unset).
// Kept in its own dependency-free module so the client component can import it
// without pulling the server-only db graph (lib/plans → lib/db) into the client bundle.
export const DURATION_OPTIONS = [
  "1 week", "2 weeks", "3 weeks", "4 weeks", "1 month", "3 months", "6 months", "Finish off, no repeat",
] as const;
