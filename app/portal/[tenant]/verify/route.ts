import { NextResponse } from "next/server";
import { getTenantDb, runWithDb } from "@/lib/db";
import { consumePortalLoginToken } from "@/lib/portal";
import { signPortalSession } from "@/lib/auth/portal-session";

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let patientId: number | null = null;
  try {
    const client = await getTenantDb(tenant);
    patientId = await runWithDb(client, () => consumePortalLoginToken(token));
  } catch { patientId = null; }

  const base = process.env.APP_BASE_URL || new URL(req.url).origin;
  if (!patientId) return NextResponse.redirect(`${base}/portal/${tenant}/login?error=1`);

  const jwt = await signPortalSession({ tenantId: tenant, patientId });
  const res = NextResponse.redirect(`${base}/portal/${tenant}`);
  res.cookies.set("psess", jwt, { httpOnly: true, secure: true, sameSite: "lax", path: `/portal/${tenant}`, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
