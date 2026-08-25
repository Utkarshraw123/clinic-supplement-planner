import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { finaliseAndSend } from "@/lib/delivery";
import { getDashboardStats, recentPatients, recentlySent } from "@/lib/dashboard";

describe("dashboard", () => {
  beforeAll(async () => { await runMigrations(); });
  it("aggregates counts and recents including a sent plan", async () => {
    const brandId = await createBrand({ name: `Dash ${Date.now()}` });
    const productId = await createProduct({ brandId, name: "Dash Product", form: "capsule" });
    const patientId = await createPatient({ name: `Dashboard Patient ${Date.now()}`, dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, productId);
    await finaliseAndSend({ planId, email: "dash@example.com" });

    const stats = await getDashboardStats();
    expect(stats.patientCount).toBeGreaterThanOrEqual(1);
    expect(stats.plansSentAllTime).toBeGreaterThanOrEqual(1);
    expect(stats.plansSentThisWeek).toBeGreaterThanOrEqual(1);

    expect((await recentPatients()).some((p) => p.id === patientId)).toBe(true);
    expect((await recentlySent()).some((s) => s.email === "dash@example.com")).toBe(true);
  });
});
