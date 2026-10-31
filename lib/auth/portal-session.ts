import { SignJWT, jwtVerify } from "jose";

export type PortalSession = { tenantId: string; patientId: number };

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me-32-characters!");
}

export async function signPortalSession(p: PortalSession): Promise<string> {
  return new SignJWT({ ...p, kind: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyPortalSession(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "portal" || !payload.tenantId || payload.patientId == null) return null;
    return { tenantId: String(payload.tenantId), patientId: Number(payload.patientId) };
  } catch {
    return null;
  }
}
