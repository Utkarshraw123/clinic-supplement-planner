import { getSnapshotPdf } from "@/lib/delivery";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const pdf = await getSnapshotPdf(Number(params.id));
  if (!pdf) return new Response("Not found", { status: 404 });
  // ?download=1 forces a file download (for printing / WhatsApp); default is inline preview.
  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="supplement-plan-${params.id}.pdf"`,
    },
  });
}
