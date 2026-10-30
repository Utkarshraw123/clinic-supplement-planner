import { findControlUserByEmail, findPrimaryMembership } from "@/lib/control-users";
import { verifyPassword } from "@/lib/auth/password";
import type { SessionPayload } from "@/lib/auth/session";

// Authenticate against the control-plane and resolve the user's primary tenant.
// The membership role (owner|admin|practitioner) is collapsed to the session
// role (admin|team) so existing role checks keep working unchanged.
export async function resolveLogin(email: string, password: string): Promise<SessionPayload | null> {
  const user = await findControlUserByEmail(email);
  if (!user) return null;
  if (!(await verifyPassword(password, user.password_hash))) return null;
  const membership = await findPrimaryMembership(user.id);
  if (!membership) return null;
  const role: "admin" | "team" = membership.role === "practitioner" ? "team" : "admin";
  return { userId: user.id, tenantId: membership.tenant_id, role, name: user.name };
}
