import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSession } from "@/lib/auth/portal-session";

export async function requirePortalPatient(tenant: string): Promise<number> {
  const token = cookies().get("psess")?.value;
  const s = token ? await verifyPortalSession(token) : null;
  if (!s || s.tenantId !== tenant) redirect(`/portal/${tenant}/login`);
  return s!.patientId;
}
