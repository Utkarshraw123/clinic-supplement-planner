"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { createPatient, updatePatientBasics, setPatientAttributes, type AttrType } from "@/lib/patients";

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
