import { getSnapshotPdf } from "@/lib/delivery";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const pdf = await getSnapshotPdf(Number(params.id));
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="supplement-plan-${params.id}.pdf"` },
  });
}
