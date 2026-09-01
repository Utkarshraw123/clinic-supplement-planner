// Controlled list offered in the plan builder's Duration dropdown (blank = unset).
// Kept in its own dependency-free module so the client component can import it
// without pulling the server-only db graph (lib/plans → lib/db) into the client bundle.
export const DURATION_OPTIONS = [
  "1 week", "2 weeks", "3 weeks", "4 weeks", "1 month", "3 months", "6 months", "Finish off, no repeat",
] as const;

// Pack-size options offered per prescription item (blank = use the product's default size).
export const SIZE_OPTIONS = [
  "30 capsules", "60 capsules", "90 capsules", "120 capsules", "180 capsules", "250g powder", "500g powder",
] as const;
