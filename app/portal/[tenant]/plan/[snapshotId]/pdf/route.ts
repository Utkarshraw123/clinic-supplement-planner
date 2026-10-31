import { NextResponse } from "next/server";
import { getTenantDb, runWithDb } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyPortalSession } from "@/lib/auth/portal-session";
import { getSnapshotOwnerPatientId, getSnapshotPdf } from "@/lib/delivery";

export async function GET(_req: Request, { params }: { params: { tenant: string; snapshotId: string } }) {
  const tenant = params.tenant;
  const token = cookies().get("psess")?.value;
  const session = token ? await verifyPortalSession(token) : null;
  if (!session || session.tenantId !== tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshotId = Number(params.snapshotId);
  const client = await getTenantDb(tenant);
  const pdf = await runWithDb(client, async () => {
    const owner = await getSnapshotOwnerPatientId(snapshotId);
    if (owner !== session.patientId) return null;
    return getSnapshotPdf(snapshotId);
  });
  if (!pdf) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(pdf, {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="plan-${snapshotId}.pdf"` },
  });
}
