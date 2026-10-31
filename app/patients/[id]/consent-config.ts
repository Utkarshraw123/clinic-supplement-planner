// Plain (non-"use server") config so it can be imported by both the server
// actions and the page. A "use server" file may only export async functions.
export const CONSENT_PURPOSES = [
  { key: "health_data_processing", label: "Health-data processing", version: "v1" },
  { key: "marketing", label: "Marketing emails", version: "v1" },
] as const;
