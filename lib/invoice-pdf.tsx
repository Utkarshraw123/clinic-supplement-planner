import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { MERRIWEATHER_REGULAR, MERRIWEATHER_BOLD } from "@/lib/pdf-fonts";
import type { InvoiceRow, InvoiceItemRow } from "@/lib/invoices";
import type { ClinicSettings } from "@/lib/settings";

Font.register({ family: "Merriweather", fonts: [{ src: MERRIWEATHER_REGULAR }, { src: MERRIWEATHER_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback((word) => [word]);

const INK = "#2C2C2A";
const MUTED = "#6B6B63";
const GOLD = "#A17C3A";

function money(cents: number, currency: string): string {
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

const st = StyleSheet.create({
  page: { fontFamily: "Merriweather", fontSize: 10, color: INK, padding: 48, lineHeight: 1.5 },
  h1: { fontSize: 18, fontWeight: 700, color: GOLD },
  row: { flexDirection: "row", justifyContent: "space-between" },
  right: { textAlign: "right" },
  muted: { color: MUTED },
  section: { marginTop: 18 },
  th: { flexDirection: "row", borderBottom: `1px solid ${GOLD}`, paddingBottom: 4, marginTop: 14, fontWeight: 700 },
  td: { flexDirection: "row", borderBottom: "1px solid #eeeeee", paddingTop: 5, paddingBottom: 5 },
  cDesc: { flex: 1 },
  cQty: { width: 44, textAlign: "right" },
  cUnit: { width: 76, textAlign: "right" },
  cAmt: { width: 76, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: 240 },
  trow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2, paddingBottom: 2 },
  grand: { fontWeight: 700, fontSize: 12, borderTop: `1px solid ${GOLD}`, marginTop: 4, paddingTop: 4 },
});

export function InvoiceDoc({ invoice, items, settings, patientName }: { invoice: InvoiceRow; items: InvoiceItemRow[]; settings: ClinicSettings; patientName: string }) {
  const cur = invoice.currency || "EUR";
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <View style={st.row}>
          <View>
            <Text style={st.h1}>{settings.clinic_name || "Invoice"}</Text>
            {settings.address ? <Text style={st.muted}>{settings.address}</Text> : null}
            {settings.contact ? <Text style={st.muted}>{settings.contact}</Text> : null}
            {settings.vat_number ? <Text style={st.muted}>VAT {settings.vat_number}</Text> : null}
          </View>
          <View style={st.right}>
            <Text style={{ fontWeight: 700, fontSize: 13 }}>INVOICE</Text>
            <Text style={st.muted}>{invoice.number ?? "(draft)"}</Text>
            {invoice.issue_date ? <Text style={st.muted}>Issued {invoice.issue_date}</Text> : null}
            {invoice.due_date ? <Text style={st.muted}>Due {invoice.due_date}</Text> : null}
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.muted}>Bill to</Text>
          <Text>{patientName}</Text>
        </View>

        <View style={st.th}>
          <Text style={st.cDesc}>Description</Text>
          <Text style={st.cQty}>Qty</Text>
          <Text style={st.cUnit}>Unit</Text>
          <Text style={st.cAmt}>Amount</Text>
        </View>
        {items.map((it) => (
          <View key={it.id} style={st.td}>
            <Text style={st.cDesc}>{it.description}</Text>
            <Text style={st.cQty}>{it.quantity}</Text>
            <Text style={st.cUnit}>{money(it.unit_price_cents, cur)}</Text>
            <Text style={st.cAmt}>{money(it.amount_cents, cur)}</Text>
          </View>
        ))}

        <View style={st.totals}>
          <View style={st.trow}><Text>Subtotal</Text><Text>{money(invoice.subtotal_cents, cur)}</Text></View>
          {invoice.tax_cents > 0 ? (
            <View style={st.trow}><Text>VAT {invoice.tax_rate ?? 0}%</Text><Text>{money(invoice.tax_cents, cur)}</Text></View>
          ) : null}
          <View style={[st.trow, st.grand]}><Text>Total</Text><Text>{money(invoice.total_cents, cur)}</Text></View>
        </View>

        {invoice.notes ? <View style={st.section}><Text style={st.muted}>Notes</Text><Text>{invoice.notes}</Text></View> : null}
        {invoice.payment_link_url ? <View style={st.section}><Text style={st.muted}>Pay online</Text><Text>{invoice.payment_link_url}</Text></View> : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceRow, items: InvoiceItemRow[], settings: ClinicSettings, patientName: string): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc invoice={invoice} items={items} settings={settings} patientName={patientName} />);
}
