import { getCurrentUser } from "@/lib/auth/current-user";
import { renderPlanPdf, type GuidePdfData } from "@/lib/pdf";
import { getLetterheadTheme } from "@/lib/pdf-themes";

// A representative sample plan, so Lorna can see a letterhead colourway in full
// without finalising a real plan. Static content — only the theme changes.
const SAMPLE: GuidePdfData = {
  clientName: "Sample Client",
  consultationDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  intro: "This is a sample of your prescription letterhead. Your logo, banner and typeface stay exactly the same — only the accent colour of the headings, table and links changes.",
  nextConsultation: "At our next consultation we will review progress and adjust the plan as needed.",
  lifestyle: "Aim for 7–8 hours of sleep, lights down by 10pm.\nDaily 20-minute walk in natural light.\nReduce caffeine to one cup before noon.",
  dietary: "Protein with every meal to steady blood sugar.\nOily fish twice a week; plenty of leafy greens.",
  supplements: [
    { name: "Food-Grown Magnesium", brand: "Wild Nutrition", size: "60 capsules", dose: "1 capsule with dinner", duration: "for 3 months", note: "Supports sleep and muscle relaxation.", code: "WN10", buyLinks: [{ label: "Wild Nutrition", url: "https://www.wildnutrition.com/" }] },
    { name: "Menopause Support", brand: "Cytoplan", size: "60 capsules", dose: "2 capsules with breakfast", duration: "for 3 months", note: "", code: "CYTO15", buyLinks: [{ label: "Cytoplan", url: "https://www.cytoplan.co.uk/" }] },
    { name: "Pure Strength Vitamin D3", brand: "Wild Nutrition", size: "30 capsules", dose: "1 capsule with a meal", duration: "ongoing", note: "Take with food containing fat for absorption.", code: "", buyLinks: [{ label: "Wild Nutrition", url: "https://www.wildnutrition.com/" }] },
  ],
  medsText: "- Levothyroxine 50mcg (take away from magnesium by 4 hours)",
  notes: "This is only a preview — no client details are used. Choose a colourway and Save to apply it to future plans.",
};

export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  // getLetterheadTheme falls back to the default for a missing/unknown id.
  const theme = getLetterheadTheme(new URL(req.url).searchParams.get("template"));
  const pdf = await renderPlanPdf(SAMPLE, theme.id);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="letterhead-preview-${theme.id}.pdf"`,
    },
  });
}
