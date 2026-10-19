import {
  BorderStyle, Document, ExternalHyperlink, Footer, Header, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { GuidePdfData } from "@/lib/pdf";
import { HEADER_IMAGE, FOOTER_IMAGE } from "@/lib/pdf-assets";
import { getLetterheadTheme } from "@/lib/pdf-themes";
import { formatConsultationDate } from "@/lib/format";

// Word version of the Supplement Instruction Guide: same content, order and colours as
// the PDF (lib/pdf.tsx), built natively so Lorna can make final edits in Word. The
// letterhead banners sit in Word's real header and footer, on the themed background.

const GOLD = "A17C3A";
const INK = "2C2C2A";
const MUTED = "6B6B63";
const RULE = "E3D9C6";
const FONT = "Merriweather";

// Banner PNGs are 1300 px wide; shown at the content width of A4 with 0.61" margins.
const BANNER_W = 676;
const HEADER_H = Math.round((BANNER_W * 428) / 1300);
const FOOTER_H = Math.round((BANNER_W * 429) / 1300);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_CELL_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const NO_TABLE_BORDERS = { ...NO_CELL_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

const pngFromDataUri = (uri: string) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");

const run = (text: string, opts: { color?: string; size?: number; bold?: boolean } = {}) =>
  new TextRun({ text, font: FONT, color: opts.color ?? INK, size: opts.size ?? 22, bold: opts.bold });

// The banner image, on a full-width shaded cell when the theme has a background.
function banner(uri: string, height: number, bg: string | null): (Paragraph | Table)[] {
  const image = new Paragraph({
    children: [new ImageRun({ type: "png", data: pngFromDataUri(uri), transformation: { width: BANNER_W, height } })],
  });
  if (!bg) return [image];
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_TABLE_BORDERS,
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.CLEAR, color: "auto", fill: bg.replace("#", "") },
      borders: NO_CELL_BORDERS,
      children: [image],
    })] })],
  })];
}

// One paragraph per line; blank lines become empty spacer paragraphs (as in the PDF).
const lines = (text: string) =>
  text.split("\n").map((ln) => new Paragraph({ children: ln.trim() ? [run(ln)] : [], spacing: { after: 40 } }));

const heading = (title: string) =>
  new Paragraph({ children: [run(title.toUpperCase(), { color: GOLD, size: 24 })], spacing: { before: 280, after: 100 } });

const section = (title: string, body: string) => (body.trim() ? [heading(title), ...lines(body)] : []);

const meta = (label: string, value: string) =>
  new Paragraph({ children: [run(`${label}  `, { color: GOLD }), run(value)], spacing: { after: 40 } });

const small = (t: string) => new Paragraph({ children: [run(t, { color: MUTED, size: 17 })] });

const underline = (color: string, size: number) => ({
  top: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  bottom: { style: BorderStyle.SINGLE, size, color },
});

function supplementTable(rows: GuidePdfData["supplements"]): (Paragraph | Table)[] {
  if (rows.length === 0) return [];
  const headCell = (t: string, pct: number) => new TableCell({
    width: { size: pct, type: WidthType.PERCENTAGE },
    borders: underline(GOLD, 6),
    children: [new Paragraph({ children: [run(t.toUpperCase(), { color: GOLD, size: 17 })] })],
  });
  const body = rows.map((r) => {
    const brandSize = [r.brand, r.size].filter(Boolean).join("  ·  ");
    const dose = [new Paragraph({ children: [run(r.dose || "—", { size: 21 })] })];
    if (r.duration) dose.push(small(r.duration));
    if (r.note) dose.push(small(r.note));
    const buy = r.buyLinks.length === 0 ? [small("—")] : r.buyLinks.map((b) => new Paragraph({
      children: [new ExternalHyperlink({
        link: b.url,
        children: [new TextRun({ text: b.label ? `Buy at ${b.label}` : "Buy online", font: FONT, size: 18, color: GOLD, underline: {} })],
      })],
    }));
    if (r.code) buy.push(new Paragraph({ children: [run(`Code: ${r.code}`, { size: 17 })] }));
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({ width: { size: 37, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4),
          children: [new Paragraph({ children: [run(r.name, { bold: true })] }), ...(brandSize ? [small(brandSize)] : [])] }),
        new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4), children: dose }),
        new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: underline(RULE, 4), children: buy }),
      ],
    });
  });
  return [
    heading("Supplement Plan"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_TABLE_BORDERS,
      rows: [
        new TableRow({ tableHeader: true, children: [headCell("Supplement", 37), headCell("Dosage", 33), headCell("Where to buy", 30)] }),
        ...body,
      ],
    }),
  ];
}

// `legacySupplementText` prints the supplement plan for snapshots from before it became
// a table (their supplements were free text); it's only used when there are no rows.
export async function renderPlanDocx(data: GuidePdfData, templateId?: string | null, opts: { legacySupplementText?: string } = {}): Promise<Buffer> {
  const bg = getLetterheadTheme(templateId).bg;
  const date = formatConsultationDate(data.consultationDate);
  const children: (Paragraph | Table)[] = [
    meta("Name of client:", data.clientName),
    ...(date ? [meta("Date of consultation:", date)] : []),
    new Paragraph({ children: [] }),
    ...(data.intro ? lines(data.intro) : []),
    ...(data.nextConsultation ? lines(data.nextConsultation) : []),
    ...section("Lifestyle & Other Recommendations", data.lifestyle),
    ...section("Dietary Recommendations", data.dietary),
    ...(data.supplements.length > 0
      ? supplementTable(data.supplements)
      : section("Supplement Plan", opts.legacySupplementText ?? "")),
    ...section("Medications / Hormones / Contraception", data.medsText),
    ...section("Notes", data.notes),
  ];
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 3900, bottom: 3900, left: 880, right: 880, header: 360, footer: 360 } } },
      headers: { default: new Header({ children: banner(HEADER_IMAGE, HEADER_H, bg) }) },
      footers: { default: new Footer({ children: banner(FOOTER_IMAGE, FOOTER_H, bg) }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
