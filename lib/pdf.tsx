import { Document, Page, Text, View, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import type { PatientDetail } from "@/lib/patients";
import type { PlanGuide } from "@/lib/guide";
import { HEADER_IMAGE, FOOTER_IMAGE } from "@/lib/pdf-assets";

// The branded Supplement Instruction Guide. All practitioner/auto fields arrive already
// resolved on `PlanGuide`; this module only lays them out.
export type GuideLink = { name: string; url: string };
export type GuidePdfData = {
  clientName: string;
  consultationDate: string;
  intro: string;
  nextConsultation: string;
  lifestyle: string;
  dietary: string;
  supplementText: string;
  medsText: string;
  links: GuideLink[];
};

export function buildGuidePdfData(patient: PatientDetail, guide: PlanGuide, links: GuideLink[] = []): GuidePdfData {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  return {
    clientName: patient.name,
    consultationDate: s(guide.consultationDate),
    intro: s(guide.intro),
    nextConsultation: s(guide.nextConsultation),
    lifestyle: s(guide.lifestyle),
    dietary: s(guide.dietary),
    supplementText: s(guide.supplementText),
    medsText: s(guide.medsText),
    links: links.filter((l) => l.url.trim()),
  };
}

const GOLD = "#A17C3A";
const INK = "#2C2C2A";

const s = StyleSheet.create({
  page: { paddingTop: 212, paddingBottom: 200, paddingHorizontal: 44, fontSize: 11, color: INK, lineHeight: 1.5 },
  headerBox: { position: "absolute", top: 26, left: 44, right: 44 },
  footerBox: { position: "absolute", bottom: 24, left: 44, right: 44 },
  bannerImg: { width: "100%" },
  meta: { marginBottom: 12 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { fontSize: 11, color: GOLD, width: 118 },
  metaValue: { fontSize: 11, color: INK },
  intro: { marginBottom: 4 },
  sectionTitle: { fontSize: 12, color: GOLD, marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  line: { fontSize: 11, color: INK },
  spacer: { height: 6 },
  buyRow: { flexDirection: "row", marginBottom: 3 },
  buyName: { fontSize: 11, color: INK, width: 200 },
  buyLink: { fontSize: 11, color: GOLD, textDecoration: "underline" },
  buyNote: { fontSize: 9.5, color: "#6B6B66", marginTop: 3 },
});

// Readable host for a link's visible text (e.g. "wildnutrition.com").
function linkHost(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

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

function GuideDoc({ data }: { data: GuidePdfData }) {
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

        {data.intro ? <View style={s.intro}><Multiline text={data.intro} /></View> : null}
        {data.nextConsultation ? <View style={s.intro}><Multiline text={data.nextConsultation} /></View> : null}

        <Section title="Lifestyle & Other Recommendations" body={data.lifestyle} />
        <Section title="Dietary Recommendations" body={data.dietary} />
        <Section title="Supplement Plan" body={data.supplementText} />

        {data.links.length > 0 ? (
          <View wrap={false}>
            <Text style={s.sectionTitle}>Where to buy your supplements</Text>
            {data.links.map((l, i) => (
              <View key={i} style={s.buyRow}>
                <Text style={s.buyName}>{l.name}</Text>
                <Link src={l.url} style={s.buyLink}>{linkHost(l.url)}</Link>
              </View>
            ))}
            <Text style={s.buyNote}>Tap a link to open the product page.</Text>
          </View>
        ) : null}

        <Section title="Medications / Hormones / Contraception" body={data.medsText} />

        <View fixed style={s.footerBox}>
          <Image src={FOOTER_IMAGE} style={s.bannerImg} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(data: GuidePdfData): Promise<Buffer> {
  return renderToBuffer(<GuideDoc data={data} />);
}
