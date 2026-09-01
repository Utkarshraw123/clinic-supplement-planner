import { describe, it, expect } from "vitest";
import { renderPlanPdf, buildGuidePdfData, type GuidePdfData } from "@/lib/pdf";
import type { PatientDetail } from "@/lib/patients";
import type { SupplementRow } from "@/lib/guide";

const row = (partial: Partial<SupplementRow>): SupplementRow => ({
  name: "Magnesium", brand: "Wild Nutrition", size: "60 capsules", dose: "1 daily",
  duration: "for 3 months", note: "", code: "", buyLinks: [], ...partial,
});

describe("pdf", () => {
  it("renders a non-empty branded guide PDF with a supplement table + notes", async () => {
    const data: GuidePdfData = {
      clientName: "Emma Hartley",
      consultationDate: "2026-08-26",
      intro: "Here we go, Emma — lovely to see you today.",
      nextConsultation: "Next consultation we will discuss a gut cleanse.",
      lifestyle: "Prioritise sleep.\nWalk daily.",
      dietary: "Reduce caffeine.",
      supplements: [
        row({ name: "Food-Grown Magnesium", code: "WN10", buyLinks: [{ label: "Wild Nutrition", url: "https://www.wildnutrition.com/x" }] }),
        row({ name: "Iron Plus", brand: "Cytoplan", buyLinks: [{ label: "Cytoplan", url: "https://www.cytoplan.co.uk/y" }] }),
      ],
      medsText: "- Levothyroxine 50mcg",
      notes: "Reach out any time.",
    };
    const buf = await renderPlanPdf(data);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders every supplement row — a longer plan does not clip (regression: 5 added, 3 printed)", async () => {
    const few = await renderPlanPdf(buildGuidePdfData(
      { id: 1, name: "P", dob: "1990-01-01", attributes: [] } as PatientDetail,
      { consultationDate: "2026-09-01", intro: null, nextConsultation: null, lifestyle: null, dietary: null, supplementText: null, medsText: null, notes: null },
      [row({ name: "One" })]
    ));
    const many = await renderPlanPdf(buildGuidePdfData(
      { id: 1, name: "P", dob: "1990-01-01", attributes: [] } as PatientDetail,
      { consultationDate: "2026-09-01", intro: null, nextConsultation: null, lifestyle: null, dietary: null, supplementText: null, medsText: null, notes: null },
      Array.from({ length: 8 }, (_, i) => row({ name: `Supplement number ${i + 1}` }))
    ));
    // More rows → a materially larger PDF (content isn't dropped/clipped).
    expect(many.length).toBeGreaterThan(few.length);
    expect(many.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("maps a patient + guide + supplements into pdf data, trimming blanks", () => {
    const patient = { id: 1, name: "Emma Hartley", dob: "1988-03-14", attributes: [] } as PatientDetail;
    const data = buildGuidePdfData(patient, {
      consultationDate: "2026-08-26", intro: "  hi  ", nextConsultation: null,
      lifestyle: null, dietary: null, supplementText: null, medsText: null, notes: "  final word  ",
    }, [row({ name: "Magnesium" })]);
    expect(data.clientName).toBe("Emma Hartley");
    expect(data.intro).toBe("hi");
    expect(data.nextConsultation).toBe("");
    expect(data.notes).toBe("final word");
    expect(data.supplements).toHaveLength(1);
    expect(data.supplements[0].name).toBe("Magnesium");
  });
});
