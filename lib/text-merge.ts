// Combine a section's existing text with incoming text without ever losing either:
// empty existing → incoming; empty incoming → existing; both → existing, a blank line,
// then incoming. Dependency-free so client components can use it too.
export function mergeSection(existing: string | null | undefined, incoming: string | null | undefined): string {
  const a = (existing ?? "").trim();
  const b = (incoming ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  return `${a}\n\n${b}`;
}
