import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createUser } from "@/lib/users";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem } from "@/lib/plans";
import { finalisePlanToSnapshot, finaliseAndSend } from "@/lib/delivery";
import { getPractitionerBreakdown } from "@/lib/analytics";

describe("practitioner analytics", () => {
  beforeAll(async () => { await runMigrations(); });

  it("attributes patients, plans, finalisations and sends to the acting practitioner", async () => {
    const stamp = Date.now();
    const nutritionistId = await createUser({ email: `nut${stamp}@c.test`, password: "x", role: "team", name: `Nut ${stamp}` });

    const brandId = await createBrand({ name: `An ${stamp}` });
    const productId = await createProduct({ brandId, name: "An Magnesium", form: "capsule" });

    // Two patients created by this nutritionist.
    const p1 = await createPatient({ name: "An P1", dob: "1990-01-01", createdBy: nutritionistId });
    const p2 = await createPatient({ name: "An P2", dob: "1990-01-01", createdBy: nutritionistId });

    // One plan finalised (download only), one finalised + sent.
    const plan1 = await getOrCreateDraftPlan(p1, nutritionistId);
    await addPlanItem(plan1, productId);
    await finalisePlanToSnapshot({ planId: plan1, actorId: nutritionistId });

    const plan2 = await getOrCreateDraftPlan(p2, nutritionistId);
    await addPlanItem(plan2, productId);
    await finaliseAndSend({ planId: plan2, email: "c@example.com", actorId: nutritionistId });

    const rows = await getPractitionerBreakdown();
    const mine = rows.find((r) => r.userId === nutritionistId)!;
    expect(mine.patients).toBe(2);
    expect(mine.plansBuilt).toBe(2);
    expect(mine.plansFinalised).toBe(2);
    expect(mine.plansSent).toBe(1);
  });
});
