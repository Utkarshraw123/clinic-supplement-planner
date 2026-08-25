import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm, listTerms } from "@/lib/taxonomies";

describe("taxonomies", () => {
  beforeAll(async () => { await runMigrations(); });
  it("adds a term idempotently and lists by type", async () => {
    const id1 = await addTerm("allergen", "mushroom");
    const id2 = await addTerm("allergen", "  mushroom  ");
    expect(id1).toBe(id2);
    const allergens = await listTerms("allergen");
    expect(allergens.some((t) => t.label === "mushroom")).toBe(true);
    expect(allergens.every((t) => t.type === "allergen")).toBe(true);
  });
});
