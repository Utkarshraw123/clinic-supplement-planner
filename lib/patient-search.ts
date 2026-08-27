/**
 * Pure, deterministic client-side filter for the patients list. The list is
 * small (one clinic's caseload) and already server-rendered, so we filter the
 * loaded rows in the browser rather than round-tripping to an API.
 *
 * Matches a patient when the query is a case-insensitive substring of either
 * the name or the DOB. An empty/whitespace query returns everything.
 */
export type PatientRow = { id: number; name: string; dob: string };

export function filterPatients<T extends PatientRow>(patients: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return patients;
  return patients.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.dob ?? "").toLowerCase().includes(q)
  );
}
