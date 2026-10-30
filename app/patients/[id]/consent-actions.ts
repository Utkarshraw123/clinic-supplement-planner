"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { recordConsent, withdrawConsent } from "@/lib/consent";

export const CONSENT_PURPOSES = [
  { key: "health_data_processing", label: "Health-data processing", version: "v1" },
  { key: "marketing", label: "Marketing emails", version: "v1" },
] as const;

const VERSIONS: Record<string, string> = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p.key, p.version]));

export async function grantConsentAction(patientId: number, purpose: string): Promise<void> {
  const u = await requireUser();
  await recordConsent({ patientId, purpose, version: VERSIONS[purpose] ?? "v1", actorId: u.userId });
  revalidatePath(`/patients/${patientId}`);
}

export async function withdrawConsentAction(patientId: number, purpose: string): Promise<void> {
  const u = await requireUser();
  await withdrawConsent({ patientId, purpose, actorId: u.userId });
  revalidatePath(`/patients/${patientId}`);
}
