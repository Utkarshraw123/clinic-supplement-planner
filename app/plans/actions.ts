"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { deletePlan } from "@/lib/plans";

export async function deletePlanAction(planId: number) {
  await requireUser();
  await deletePlan(planId);
  revalidatePath("/plans/drafts");
  revalidatePath("/dashboard");
}
