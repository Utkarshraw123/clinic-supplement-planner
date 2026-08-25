import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addTerm } from "@/lib/taxonomies";
import * as Pt from "@/lib/patients";

describe("patients", () => {
  beforeAll(async () => { await runMigrations(); });
  it("creates a patient and replaces attributes", async () => {
    const id = await Pt.createPatient({ name: "Emma Hartley", dob: "1988-03-14" });
    const mushroom = await addTerm("allergen", "mushroom");
    const energy = await addTerm("concern", "energy");
    await Pt.setPatientAttributes(id, [
      { termId: mushroom, attrType: "allergy" },
      { termId: energy, attrType: "goal" },
    ]);
    let detail = await Pt.getPatient(id);
    expect(detail!.name).toBe("Emma Hartley");
    expect(detail!.attributes.map((a) => a.attrType).sort()).toEqual(["allergy","goal"]);

    await Pt.setPatientAttributes(id, [{ termId: energy, attrType: "goal" }]);
    detail = await Pt.getPatient(id);
    expect(detail!.attributes).toHaveLength(1);
  });
});
