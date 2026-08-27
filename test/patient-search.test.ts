import { describe, it, expect } from "vitest";
import { filterPatients, type PatientRow } from "@/lib/patient-search";

const patients: PatientRow[] = [
  { id: 1, name: "Charlotte Bennett", dob: "1985-06-22" },
  { id: 2, name: "James Whitfield", dob: "1978-11-03" },
  { id: 3, name: "Priya Sharma", dob: "1990-02-17" },
];

describe("filterPatients", () => {
  it("returns everything for an empty or whitespace query", () => {
    expect(filterPatients(patients, "")).toHaveLength(3);
    expect(filterPatients(patients, "   ")).toHaveLength(3);
  });

  it("matches on a case-insensitive name substring", () => {
    expect(filterPatients(patients, "char").map((p) => p.id)).toEqual([1]);
    expect(filterPatients(patients, "SHARMA").map((p) => p.id)).toEqual([3]);
  });

  it("matches on surname as well as first name", () => {
    expect(filterPatients(patients, "whitfield").map((p) => p.id)).toEqual([2]);
  });

  it("matches on a DOB substring (year or full date)", () => {
    expect(filterPatients(patients, "1990").map((p) => p.id)).toEqual([3]);
    expect(filterPatients(patients, "1978-11-03").map((p) => p.id)).toEqual([2]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterPatients(patients, "zzz")).toEqual([]);
  });
});
