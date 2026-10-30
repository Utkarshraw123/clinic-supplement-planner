import { provisionTenant } from "@/lib/tenancy/provision";
import { uniqueTenantSlug } from "@/lib/tenancy/slug";
import { resolveCreateDb } from "@/lib/tenancy/create-db";
import { findControlUserByEmail } from "@/lib/control-users";
import { createTursoDatabase } from "@/lib/tenancy/turso";

export class SignupError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SignupError";
  }
}

export async function signupClinic(
  input: { clinicName: string; ownerName: string; email: string; password: string },
  deps: { createDb?: typeof createTursoDatabase } = {}
): Promise<{ tenantId: string; tenantUserId: number }> {
  const email = input.email.trim().toLowerCase();
  if (await findControlUserByEmail(email)) {
    throw new SignupError("email_taken", "That email is already registered.");
  }
  const tenantId = await uniqueTenantSlug(input.clinicName);
  const { tenantUserId } = await provisionTenant(
    { tenantId, clinicName: input.clinicName.trim(), ownerEmail: email, ownerName: input.ownerName.trim(), ownerPassword: input.password },
    { createDb: deps.createDb ?? resolveCreateDb() }
  );
  return { tenantId, tenantUserId };
}
