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

// The body — typeface, layout and the original gold palette — is IDENTICAL for
// every theme. A theme only changes the background colour behind the header and
// footer banners (see the bands in GuideDoc); the gold logo/text is untouched.
const GOLD = "#A17C3A";
const INK = "#2C2C2A";
const MUTED = "#6B6B63";
const RULE = "#E3D9C6";

// Full-bleed coloured strips sit behind the (transparent) header/footer banners.
// Heights cover each banner plus a little margin so the strip reads as one panel.
const HEADER_BAND_H = 200;
const FOOTER_BAND_H = 196;

const s = StyleSheet.create({
  page: { fontFamily: "Merriweather", paddingTop: 212, paddingBottom: 200, paddingHorizontal: 44, fontSize: 11, color: INK, lineHeight: 1.5 },
  headerBand: { position: "absolute", top: 0, left: 0, right: 0, height: HEADER_BAND_H },
  footerBand: { position: "absolute", bottom: 0, left: 0, right: 0, height: FOOTER_BAND_H },
  headerBox: { position: "absolute", top: 26, left: 44, right: 44 },
  footerBox: { position: "absolute", bottom: 24, left: 44, right: 44 },
  bannerImg: { width: "100%" },
  meta: { marginBottom: 12 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { fontSize: 11, color: GOLD, width: 118 },
  metaValue: { fontSize: 11, color: INK },
  intro: { marginBottom: 4 },
  sectionTitle: { fontSize: 12, color: GOLD, marginTop: 14, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },
  line: { fontSize: 11, color: INK },
  spacer: { height: 6 },

  // Supplement table
  tHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GOLD, paddingBottom: 4, marginBottom: 2 },
  tHeadCell: { fontSize: 8.5, color: GOLD, textTransform: "uppercase", letterSpacing: 0.4 },
  tRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE, paddingVertical: 7 },
  cSupp: { width: "37%", paddingRight: 8 },
  cDose: { width: "33%", paddingRight: 8 },
  cBuy: { width: "30%" },
  suppName: { fontSize: 11, color: INK, fontWeight: 700 },
  sub: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  doseMain: { fontSize: 10.5, color: INK },
  doseNote: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  buyLink: { fontSize: 9, color: GOLD, textDecoration: "underline", marginBottom: 2 },
  codePill: { fontSize: 8.5, color: INK, marginTop: 2 },
});

// @react-pdf does not honour "\n" inside a single <Text>; split into lines.
function Multiline({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((ln, i) => (ln.trim() === "" ? <View key={i} style={s.spacer} /> : <Text key={i} style={s.line}>{ln}</Text>))}
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <View wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Multiline text={body} />
    </View>
  );
}

// The supplement plan as a structured table. The table itself wraps across pages;
// each row is kept whole (wrap={false}) so a supplement is never split mid-row.
function SupplementTable({ rows }: { rows: SupplementRow[] }) {
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

function GuideDoc({ data, bg }: { data: GuidePdfData; bg: string | null }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Themed background strip behind the header banner (null = plain white). */}
        {bg ? <View fixed style={[s.headerBand, { backgroundColor: bg }]} /> : null}
        <View fixed style={s.headerBox}>
          <Image src={HEADER_IMAGE} style={s.bannerImg} />
        </View>

        <View style={s.meta}>
          <View style={s.metaRow}><Text style={s.metaLabel}>Name of client:</Text><Text style={s.metaValue}>{data.clientName}</Text></View>
          {data.consultationDate ? (
            <View style={s.metaRow}><Text style={s.metaLabel}>Date of consultation:</Text><Text style={s.metaValue}>{data.consultationDate}</Text></View>
          ) : null}
        </View>

        {data.intro ? <View style={s.intro}><Multiline text={data.intro} /></View> : null}
        {data.nextConsultation ? <View style={s.intro}><Multiline text={data.nextConsultation} /></View> : null}

        <Section title="Lifestyle & Other Recommendations" body={data.lifestyle} />
        <Section title="Dietary Recommendations" body={data.dietary} />
        <SupplementTable rows={data.supplements} />
        <Section title="Medications / Hormones / Contraception" body={data.medsText} />
        <Section title="Notes" body={data.notes} />

        {/* Themed background strip behind the footer banner. */}
        {bg ? <View fixed style={[s.footerBand, { backgroundColor: bg }]} /> : null}
        <View fixed style={s.footerBox}>
          <Image src={FOOTER_IMAGE} style={s.bannerImg} />
        </View>
      </Page>
    </Document>
  );
}

// `templateId` selects the letterhead background colour (from clinic settings); an
// unknown or missing id falls back to the default (plain white) theme.
export async function renderPlanPdf(data: GuidePdfData, templateId?: string | null): Promise<Buffer> {
  return renderToBuffer(<GuideDoc data={data} bg={getLetterheadTheme(templateId).bg} />);
}
