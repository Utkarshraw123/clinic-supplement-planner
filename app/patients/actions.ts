"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createPatient, updatePatientBasics, setPatientAttributes, type AttrType } from "@/lib/patients";
import { addTerm, type TermType } from "@/lib/taxonomies";

export async function createPatientAction(formData: FormData) {
  const u = await requireUser();
  const id = await createPatient({ name: String(formData.get("name")), dob: String(formData.get("dob")), createdBy: u.userId });
  redirect(`/patients/${id}`);
}

export async function savePatientBasicsAction(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  await updatePatientBasics(id, { name: String(formData.get("name")), dob: String(formData.get("dob")) });
  revalidatePath(`/patients/${id}`);
}

// Add a taxonomy term inline (so a practitioner can capture an option that's missing
// from any of the four clinical sections). Idempotent — returns the existing id if present.
export async function addTermAction(termType: TermType, label: string): Promise<{ id: number; label: string }> {
  await requireUser();
  const clean = label.trim();
  if (!clean) throw new Error("A label is required");
  const id = await addTerm(termType, clean);
  return { id, label: clean };
}

export async function savePatientAttributesAction(formData: FormData) {
  await requireUser();
  const patientId = Number(formData.get("patientId"));
  const attrs: { termId: number; attrType: AttrType }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("attr:")) {
      const attrType = key.slice(5) as AttrType;
      for (const id of String(value).split(",").filter(Boolean)) attrs.push({ termId: Number(id), attrType });
    }
  }
  await setPatientAttributes(patientId, attrs);
  revalidatePath(`/patients/${patientId}`);
}
