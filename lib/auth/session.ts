import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = { userId: number; role: "admin" | "team"; name: string };

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me-32-characters!");
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.userId), role: payload.role as "admin" | "team", name: String(payload.name) };
  } catch {
    return null;
  }
}
