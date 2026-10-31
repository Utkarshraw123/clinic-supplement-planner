import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, deletePatient } from "@/lib/patients";
import { createMealPlan, addDay, listMealPlansForPatient } from "@/lib/meal-plans";
import { exportPatientData } from "@/lib/gdpr-export";

describe("meal-plan GDPR", () => {
  beforeAll(async () => { await runMigrations(); });
  it("export includes meal plans; erasure removes them", async () => {
    const pid = await createPatient({ name: "GDPR Meal", dob: "1990-01-01" });
    const planId = await createMealPlan(pid, { title: "W" }, 1);
    await addDay(planId);
    const exp = await exportPatientData(pid);
    expect(exp.mealPlans.length).toBe(1);
    await deletePatient(pid, 1);
    expect(await listMealPlansForPatient(pid)).toHaveLength(0);
  });
});
