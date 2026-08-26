import { describe, it, expect } from "vitest";
import { renderPlanPdf, buildGuidePdfData, attachLinksToLines, type GuidePdfData } from "@/lib/pdf";
import type { PatientDetail } from "@/lib/patients";

describe("pdf", () => {
  it("renders a non-empty branded guide PDF with the PDF header", async () => {
    const data: GuidePdfData = {
      clientName: "Emma Hartley",
      consultationDate: "2026-08-26",
      intro: "Here we go, Emma — lovely to see you today.",
      nextConsultation: "Next consultation we will discuss a gut cleanse.",
      lifestyle: "Prioritise sleep.\nWalk daily.",
      dietary: "Reduce caffeine.",
      supplementText: "1. Food-Grown Magnesium — 1 capsule with evening meal",
      medsText: "- Levothyroxine 50mcg",
      links: [{ name: "Food-Grown Magnesium", url: "https://www.wildnutrition.com/products/food-grown-magnesium" }],
    };
    const buf = await renderPlanPdf(data);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("maps a patient + guide into pdf data, trimming blanks and keeping only real links", () => {
    const patient = { id: 1, name: "Emma Hartley", dob: "1988-03-14", attributes: [] } as PatientDetail;
    const data = buildGuidePdfData(patient, {
      consultationDate: "2026-08-26", intro: "  hi  ", nextConsultation: null,
      lifestyle: null, dietary: null, supplementText: "1. Magnesium", medsText: null,
    }, [
      { name: "Magnesium", url: "https://www.wildnutrition.com/products/food-grown-magnesium" },
      { name: "No link", url: "" },
    ]);
    expect(data.clientName).toBe("Emma Hartley");
    expect(data.intro).toBe("hi");
    expect(data.nextConsultation).toBe("");
    expect(data.supplementText).toBe("1. Magnesium");
    expect(data.links).toHaveLength(1);
    expect(data.links[0].name).toBe("Magnesium");
  });

  it("attaches each product link once, to the line that names it (longest name wins)", () => {
    const text = "1. Magnesium Plus — 2 caps\nSupports relaxation\n2. Magnesium — 1 cap at night";
    const lines = attachLinksToLines(text, [
      { name: "Magnesium", url: "https://x/mag" },
      { name: "Magnesium Plus", url: "https://x/magplus" },
    ]);
    expect(lines[0].url).toBe("https://x/magplus"); // "Magnesium Plus" line → the Plus link
    expect(lines[1].url).toBeUndefined();            // description line gets no link
    expect(lines[2].url).toBe("https://x/mag");      // plain "Magnesium" line → the mag link
  });
});
