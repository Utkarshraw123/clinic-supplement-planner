import { describe, it, expect } from "vitest";
import { renderPlanPdf, type PlanPdfData } from "@/lib/pdf";

describe("pdf", () => {
  it("renders a non-empty PDF buffer with the PDF header", async () => {
    const data: PlanPdfData = {
      clinic: { name: "Lorna Clinic", address: "12 Harley St", contact: "020 7000 0000" },
      patientName: "Emma Hartley",
      patientDob: "1988-03-14",
      preparedDate: "2026-08-25",
      items: [{ name: "Magnesium", brand: "Wild Nutrition", packageSize: "60 caps", dosing: "1 at night", alternativeName: null, suppliers: [{ label: "Wild", url: "https://x" }] }],
    };
    const buf = await renderPlanPdf(data);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
