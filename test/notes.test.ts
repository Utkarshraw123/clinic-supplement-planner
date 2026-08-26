import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createBrand } from "@/lib/brands";
import { createProduct } from "@/lib/products";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan, addPlanItem, getPlan } from "@/lib/plans";
import { defaultSupplementText } from "@/lib/guide";
import { createSnippet, listSnippets, deleteSnippet } from "@/lib/notes";

describe("product default notes + snippet library", () => {
  beforeAll(async () => { await runMigrations(); });

  it("auto-appends a product's default note to its supplement line", async () => {
    const brandId = await createBrand({ name: `N ${Date.now()}` });
    const pid = await createProduct({ brandId, name: "N Magnesium", form: "capsule", defaultNote: "Only take at night" });
    const patientId = await createPatient({ name: "Note P", dob: "1990-01-01" });
    const planId = await getOrCreateDraftPlan(patientId);
    await addPlanItem(planId, pid);
    const plan = (await getPlan(planId))!;

    const text = defaultSupplementText(plan);
    expect(text).toContain("N Magnesium");
    expect(text).toContain("· Only take at night");
  });

  it("creates, lists and deletes reusable snippets", async () => {
    const t = `Add to water ${Date.now()}`;
    const id = await createSnippet(t);
    expect((await listSnippets()).some((s) => s.text === t)).toBe(true);
    await deleteSnippet(id);
    expect((await listSnippets()).some((s) => s.text === t)).toBe(false);
  });
});
