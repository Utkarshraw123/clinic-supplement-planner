import { Document, Page, Text, View, Image, Link, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import type { PatientDetail } from "@/lib/patients";
import type { PlanGuide, SupplementRow } from "@/lib/guide";
import { HEADER_IMAGE, FOOTER_IMAGE } from "@/lib/pdf-assets";
import { MERRIWEATHER_REGULAR, MERRIWEATHER_BOLD } from "@/lib/pdf-fonts";
import { getLetterheadTheme, type LetterheadTheme } from "@/lib/pdf-themes";

// The whole prescription is set in Merriweather (embedded, no runtime fetch).
Font.register({
  family: "Merriweather",
  fonts: [
    { src: MERRIWEATHER_REGULAR },
    { src: MERRIWEATHER_BOLD, fontWeight: 700 },
  ],
});
// Merriweather has no italic face bundled — avoid @react-pdf trying to fetch one.
Font.registerHyphenationCallback((word) => [word]);

// The branded Supplement Instruction Guide. Free-text sections arrive resolved on
// `PlanGuide`; the supplement plan arrives as structured rows (built from the plan
// items) and is laid out as a TABLE — so what prints always matches the plan.
export type GuidePdfData = {
  clientName: string;
  consultationDate: string;
  intro: string;
  nextConsultation: string;
  lifestyle: string;
  dietary: string;
  supplements: SupplementRow[];
  medsText: string;
  notes: string;
};

export function buildGuidePdfData(patient: PatientDetail, guide: PlanGuide, supplements: SupplementRow[] = []): GuidePdfData {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  return {
    clientName: patient.name,
    consultationDate: s(guide.consultationDate),
    intro: s(guide.intro),
    nextConsultation: s(guide.nextConsultation),
    lifestyle: s(guide.lifestyle),
    dietary: s(guide.dietary),
    supplements,
    medsText: s(guide.medsText),
    notes: s(guide.notes),
  };
}

// Styles are a function of the chosen letterhead theme. Layout, spacing and the
// Merriweather typeface are identical for every theme — only the palette (accent,
// ink, muted, rule) differs, so the logo/banner keeps its position and the plan
// always reads the same, just in a different colourway.
type PdfStyles = ReturnType<typeof makeStyles>;
function makeStyles(theme: LetterheadTheme) {
  const { accent: ACCENT, ink: INK, muted: MUTED, rule: RULE } = theme;
  return StyleSheet.create({
    page: { fontFamily: "Merriweather", paddingTop: 212, paddingBottom: 200, paddingHorizontal: 44, fontSize: 11, color: INK, lineHeight: 1.5 },
    headerBox: { position: "absolute", top: 26, left: 44, right: 44 },
    footerBox: { position: "absolute", bottom: 24, left: 44, right: 44 },
    bannerImg: { width: "100%" },
    meta: { marginBottom: 12 },
    metaRow: { flexDirection: "row", marginBottom: 2 },
    metaLabel: { fontSize: 11, color: ACCENT, width: 118 },
    metaValue: { fontSize: 11, color: INK },
    intro: { marginBottom: 4 },
    sectionTitle: { fontSize: 12, color: ACCENT, marginTop: 14, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },
    line: { fontSize: 11, color: INK },
    spacer: { height: 6 },

    // Supplement table
    tHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ACCENT, paddingBottom: 4, marginBottom: 2 },
    tHeadCell: { fontSize: 8.5, color: ACCENT, textTransform: "uppercase", letterSpacing: 0.4 },
    tRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 7 },
    cSupp: { width: "37%", paddingRight: 8 },
    cDose: { width: "33%", paddingRight: 8 },
    cBuy: { width: "30%" },
    suppName: { fontSize: 11, color: INK, fontWeight: 700 },
    sub: { fontSize: 8.5, color: MUTED, marginTop: 1 },
    doseMain: { fontSize: 10.5, color: INK },
    doseNote: { fontSize: 8.5, color: MUTED, marginTop: 2 },
    buyLink: { fontSize: 9, color: ACCENT, textDecoration: "underline", marginBottom: 2 },
    codePill: { fontSize: 8.5, color: INK, marginTop: 2 },
  });
}

// @react-pdf does not honour "\n" inside a single <Text>; split into lines.
function Multiline({ text, s }: { text: string; s: PdfStyles }) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((ln, i) => (ln.trim() === "" ? <View key={i} style={s.spacer} /> : <Text key={i} style={s.line}>{ln}</Text>))}
    </View>
  );
}

function Section({ title, body, s }: { title: string; body: string; s: PdfStyles }) {
  if (!body.trim()) return null;
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Multiline text={body} s={s} />
    </View>
  );
}

// The supplement plan as a structured table. The table itself wraps across pages;
// each row is kept whole (wrap={false}) so a supplement is never split mid-row.
function SupplementTable({ rows, s }: { rows: SupplementRow[]; s: PdfStyles }) {
  if (rows.length === 0) return null;
  return (
    <View>
      <Text style={s.sectionTitle}>Supplement Plan</Text>
      <View style={s.tHead}>
        <Text style={[s.tHeadCell, s.cSupp]}>Supplement</Text>
        <Text style={[s.tHeadCell, s.cDose]}>Dosage</Text>
        <Text style={[s.tHeadCell, s.cBuy]}>Where to buy</Text>
      </View>
      {rows.map((r, i) => {
        const meta = [r.brand, r.size].filter(Boolean).join("  ·  ");
        return (
          <View key={i} style={s.tRow} wrap={false}>
            <View style={s.cSupp}>
              <Text style={s.suppName}>{r.name}</Text>
              {meta ? <Text style={s.sub}>{meta}</Text> : null}
            </View>
            <View style={s.cDose}>
              {r.dose ? <Text style={s.doseMain}>{r.dose}</Text> : <Text style={s.doseMain}>—</Text>}
              {r.duration ? <Text style={s.sub}>{r.duration}</Text> : null}
              {r.note ? <Text style={s.doseNote}>{r.note}</Text> : null}
            </View>
            <View style={s.cBuy}>
              {r.buyLinks.length === 0 ? <Text style={s.sub}>—</Text> : r.buyLinks.map((b, j) => (
                <Link key={j} src={b.url} style={s.buyLink}>{b.label ? `Buy at ${b.label}` : "Buy online"}</Link>
              ))}
              {r.code ? <Text style={s.codePill}>Code: {r.code}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function GuideDoc({ data, s }: { data: GuidePdfData; s: PdfStyles }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View fixed style={s.headerBox}>
          <Image src={HEADER_IMAGE} style={s.bannerImg} />
        </View>

        <View style={s.meta}>
          <View style={s.metaRow}><Text style={s.metaLabel}>Name of client:</Text><Text style={s.metaValue}>{data.clientName}</Text></View>
          {data.consultationDate ? (
            <View style={s.metaRow}><Text style={s.metaLabel}>Date of consultation:</Text><Text style={s.metaValue}>{data.consultationDate}</Text></View>
          ) : null}
        </View>

        {data.intro ? <View style={s.intro}><Multiline text={data.intro} s={s} /></View> : null}
        {data.nextConsultation ? <View style={s.intro}><Multiline text={data.nextConsultation} s={s} /></View> : null}

        <Section title="Lifestyle & Other Recommendations" body={data.lifestyle} s={s} />
        <Section title="Dietary Recommendations" body={data.dietary} s={s} />
        <SupplementTable rows={data.supplements} s={s} />
        <Section title="Medications / Hormones / Contraception" body={data.medsText} s={s} />
        <Section title="Notes" body={data.notes} s={s} />

        <View fixed style={s.footerBox}>
          <Image src={FOOTER_IMAGE} style={s.bannerImg} />
        </View>
      </Page>
    </Document>
  );
}

// `templateId` selects the letterhead colourway (from clinic settings); an unknown
// or missing id falls back to the default theme.
export async function renderPlanPdf(data: GuidePdfData, templateId?: string | null): Promise<Buffer> {
  const s = makeStyles(getLetterheadTheme(templateId));
  return renderToBuffer(<GuideDoc data={data} s={s} />);
}
