import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { exportPatientData } from "@/lib/gdpr-export";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const data = await exportPatientData(id);
  if (!data.patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit({ actorId: admin.userId, action: "exported", entity: "patient", entityId: id, detail: "data export (GDPR)" });

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="patient-${id}-export.json"`,
    },
  });
}
