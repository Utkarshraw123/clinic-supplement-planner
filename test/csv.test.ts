import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header row and one row per record", () => {
    const csv = toCsv(
      [{ a: 1, b: "x" }, { a: 2, b: "y" }],
      [{ header: "A", value: (r) => r.a }, { header: "B", value: (r) => r.b }]
    );
    expect(csv).toBe("A,B\r\n1,x\r\n2,y\r\n");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv(
      [{ name: 'Doe, Jane', note: 'she said "hi"' }],
      [{ header: "Name", value: (r) => r.name }, { header: "Note", value: (r) => r.note }]
    );
    expect(csv).toBe('Name,Note\r\n"Doe, Jane","she said ""hi"""\r\n');
  });

  it("renders null/undefined as empty cells", () => {
    const csv = toCsv([{ a: null, b: undefined }], [
      { header: "A", value: (r) => r.a },
      { header: "B", value: (r) => r.b },
    ]);
    expect(csv).toBe("A,B\r\n,\r\n");
  });
});
