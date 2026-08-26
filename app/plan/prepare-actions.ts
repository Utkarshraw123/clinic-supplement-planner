"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { savePlanGuide, type PlanGuide } from "@/lib/guide";
import { finalisePlanToSnapshot, sendSnapshotEmail } from "@/lib/delivery";

function readGuide(fd: FormData): PlanGuide {
  const g = (k: string) => {
    const v = String(fd.get(k) ?? "").replace(/\r\n/g, "\n").trim();
    return v || null;
  };
  return {
    consultationDate: g("consultationDate"),
    intro: g("intro"),
    nextConsultation: g("nextConsultation"),
    lifestyle: g("lifestyle"),
    dietary: g("dietary"),
    supplementText: g("supplementText"),
    medsText: g("medsText"),
  };
}

export async function saveGuideAction(formData: FormData) {
  await requireUser();
  const planId = Number(formData.get("planId"));
  await savePlanGuide(planId, readGuide(formData));
  revalidatePath(`/plan/${formData.get("patientId")}/prepare`);
}

export async function finaliseGuideAction(formData: FormData) {
  const u = await requireUser();
  const planId = Number(formData.get("planId"));
  const patientId = String(formData.get("patientId"));
  const email = String(formData.get("email") || "").trim();

  // Persist what the practitioner typed, then finalise (re-checks allergen safety and
  // renders the branded PDF from these fields) and optionally email it.
  await savePlanGuide(planId, readGuide(formData));
  const { snapshotId } = await finalisePlanToSnapshot({ planId, actorId: u.userId });
  if (email) await sendSnapshotEmail({ snapshotId, email, actorId: u.userId });
  redirect(`/patients/${patientId}/history`);
}
