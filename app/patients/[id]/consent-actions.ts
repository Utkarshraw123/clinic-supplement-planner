"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { recordConsent, withdrawConsent } from "@/lib/consent";
import { CONSENT_PURPOSES } from "./consent-config";

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
