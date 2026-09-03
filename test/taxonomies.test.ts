import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm, listTerms, deleteTerm } from "@/lib/taxonomies";
import { execute, query } from "@/lib/db";

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

  it("deletes an unused term but refuses one still referenced by a patient", async () => {
    const unused = await addTerm("diet", "temp-unused-diet");
    await deleteTerm(unused); // no references — allowed
    expect((await listTerms("diet")).some((t) => t.id === unused)).toBe(false);

    const inUse = await addTerm("allergen", "temp-inuse-allergen");
    await execute("INSERT INTO patients (name, dob) VALUES ('Ref Patient', '1990-01-01')");
    const [{ id: patientId }] = await query<{ id: number }>("SELECT id FROM patients WHERE name = 'Ref Patient' ORDER BY id DESC LIMIT 1");
    await execute("INSERT INTO patient_attributes (patient_id, taxonomy_term_id, attr_type) VALUES (?, ?, 'allergy')", [patientId, inUse]);
    await expect(deleteTerm(inUse)).rejects.toThrow(/still used/i);
    expect((await listTerms("allergen")).some((t) => t.id === inUse)).toBe(true);
  });
});
