import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { scribeConsultation } from "@/lib/scribe-flow";

export async function POST(req: Request) {
  const u = await requireUser();
  const form = await req.formData();
  const patientId = Number(form.get("patientId"));
  const file = form.get("audio");
  if (!patientId || !(file instanceof Blob)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const audio = Buffer.from(await file.arrayBuffer());
  try {
    const res = await scribeConsultation({ patientId, audio, contentType: file.type || "audio/webm", actorId: u.userId });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof Error && e.message === "no_recording_consent") {
      return NextResponse.json({ error: "no_recording_consent" }, { status: 403 });
    }
    throw e;
  }
}
