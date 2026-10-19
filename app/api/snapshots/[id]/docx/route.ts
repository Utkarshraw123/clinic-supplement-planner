import { getCurrentUser } from "@/lib/auth/current-user";
import { getSnapshotFrozen } from "@/lib/delivery";
import { getClinicSettings } from "@/lib/settings";
import { renderPlanDocx } from "@/lib/docx";

// Word version of a finalised plan, generated on demand from the snapshot's frozen
// data so it always matches the PDF that was made.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const frozen = await getSnapshotFrozen(Number(params.id));
  if (!frozen) return new Response("Not found", { status: 404 });
  // The letterhead the plan was finalised with; older snapshots use today's setting.
  const template = frozen.letterheadTemplate !== undefined
    ? frozen.letterheadTemplate
    : (await getClinicSettings()).letterhead_template;
  const docx = await renderPlanDocx(frozen.data, template, { legacySupplementText: frozen.legacySupplementText });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(docx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="supplement-plan-${params.id}.docx"`,
    },
  });
}
