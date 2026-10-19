import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderPlanDocx } from "@/lib/docx";
import type { GuidePdfData } from "@/lib/pdf";

const data: GuidePdfData = {
  clientName: "Emma Hartley", consultationDate: "2026-08-26",
  intro: "Hi Emma.", nextConsultation: "", lifestyle: "Sleep well.\nWalk daily.", dietary: "",
  supplements: [
    { name: "Food-Grown Magnesium", brand: "Wild Nutrition", size: "60 capsules", dose: "1 capsule at night", duration: "for 3 months", note: "with food", code: "WN10", buyLinks: [{ label: "Wild Nutrition", url: "https://wn.example/mag" }] },
    { name: "Iron Plus", brand: "Cytoplan", size: "", dose: "", duration: "See notes below", note: "", code: "", buyLinks: [] },
  ],
  medsText: "- Levothyroxine 50mcg", notes: "Reach out any time.",
};

async function parts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const read = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  const headerNames = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n));
  const header = (await Promise.all(headerNames.map(read))).join("");
  return { doc: await read("word/document.xml"), header };
}

describe("renderPlanDocx", () => {
  it("produces a .docx with the plan's content in the PDF's order", async () => {
    const buf = await renderPlanDocx(data, "original");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const { doc } = await parts(buf);
    expect(doc).toContain("Emma Hartley");
    expect(doc).toContain("26 August 2026");
    expect(doc).not.toContain("2026-08-26");
    const order = ["LIFESTYLE &amp; OTHER RECOMMENDATIONS", "SUPPLEMENT PLAN", "MEDICATIONS / HORMONES / CONTRACEPTION", "NOTES"].map((h) => doc.indexOf(h));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(doc).not.toContain("DIETARY RECOMMENDATIONS"); // empty sections are left out
    expect(doc).toContain("Food-Grown Magnesium");
    expect(doc).toContain("Iron Plus");
    expect(doc).toContain("See notes below");
    expect(doc).toContain("Code: WN10");
    expect(doc).toContain("Buy at Wild Nutrition");
  });

  it("shades the header with the theme background, and not for the original theme", async () => {
    const { header: slate } = await parts(await renderPlanDocx(data, "slate-blue"));
    expect(slate).toContain('w:fill="E7EDF3"');
    const { header: plain } = await parts(await renderPlanDocx(data, "original"));
    expect(plain).not.toContain("w:fill=");
    expect(plain).toContain("<w:drawing>"); // the banner image is still there
  });
});
