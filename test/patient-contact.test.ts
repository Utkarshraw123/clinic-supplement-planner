import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient, getPatient, updatePatientBasics } from "@/lib/patients";

describe("patient contact details", () => {
  beforeAll(async () => { await runMigrations(); });

  it("stores and reads contact fields on create", async () => {
    const id = await createPatient({ name: "Contact P", dob: "1990-01-01", email: "p@x.test", phone: "0712345", address1: "1 High St", city: "Dublin", postcode: "D01" });
    const p = await getPatient(id);
    expect(p?.email).toBe("p@x.test");
    expect(p?.phone).toBe("0712345");
    expect(p?.address1).toBe("1 High St");
    expect(p?.city).toBe("Dublin");
    expect(p?.postcode).toBe("D01");
  });

  it("updates contact fields", async () => {
    const id = await createPatient({ name: "Edit P", dob: "1990-01-01" });
    await updatePatientBasics(id, { name: "Edit P", dob: "1990-01-01", email: "new@x.test", phone: "0799" });
    const p = await getPatient(id);
    expect(p?.email).toBe("new@x.test");
    expect(p?.phone).toBe("0799");
  });

  it("leaves contact fields null when omitted", async () => {
    const id = await createPatient({ name: "Bare P", dob: "1990-01-01" });
    const p = await getPatient(id);
    expect(p?.email).toBeNull();
  });
});
