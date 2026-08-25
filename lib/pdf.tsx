import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { getClinicSettings } from "@/lib/settings";
import { getProduct } from "@/lib/products";
import type { PlanDetail } from "@/lib/plans";
import type { PatientDetail } from "@/lib/patients";

export type PlanPdfData = {
  clinic: { name: string; address: string; contact: string };
  patientName: string;
  patientDob: string;
  preparedDate: string;
  items: { name: string; brand: string; packageSize: string|null; dosing: string; alternativeName: string|null; suppliers: { label: string; url: string }[] }[];
};

export async function buildPlanPdfData(plan: PlanDetail, patient: PatientDetail): Promise<PlanPdfData> {
  const settings = await getClinicSettings();
  const items: PlanPdfData["items"] = [];
  for (const it of plan.items) {
    let alternativeName: string|null = null;
    if (it.chosenAlternativeId) {
      const alt = await getProduct(it.chosenAlternativeId);
      alternativeName = alt?.name ?? null;
    }
    items.push({
      name: it.product.name,
      brand: it.product.brand_name,
      packageSize: it.product.package_size,
      dosing: it.dosingText,
      alternativeName,
      suppliers: it.product.suppliers.map((s) => ({ label: s.label, url: s.url })),
    });
  }
  return {
    clinic: { name: settings.clinic_name ?? "Your clinic", address: settings.address ?? "", contact: settings.contact ?? "" },
    patientName: patient.name,
    patientDob: patient.dob,
    preparedDate: new Date().toISOString().slice(0, 10),
    items,
  };
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#2C2C2A" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#0F6E56", paddingBottom: 10 },
  clinic: { fontSize: 10, color: "#5F5E5A" },
  title: { fontSize: 16, color: "#0F6E56" },
  meta: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#F1EFE8", padding: 8, marginTop: 14 },
  item: { borderBottomWidth: 0.5, borderBottomColor: "#D3D1C7", paddingVertical: 10 },
  itemName: { fontSize: 13 },
  small: { fontSize: 10, color: "#5F5E5A", marginTop: 3 },
  alt: { fontSize: 10, color: "#0F6E56", backgroundColor: "#E1F5EE", padding: 5, marginTop: 4 },
  footer: { marginTop: 24, borderTopWidth: 0.5, borderTopColor: "#D3D1C7", paddingTop: 10, fontSize: 9, color: "#888780" },
});

function PlanDoc({ data }: { data: PlanPdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={{ fontSize: 13, color: "#0F6E56" }}>{data.clinic.name}</Text>
            <Text style={s.clinic}>{data.clinic.address}</Text>
            <Text style={s.clinic}>{data.clinic.contact}</Text>
          </View>
          <View>
            <Text style={s.title}>Supplement plan</Text>
            <Text style={s.clinic}>Prepared {data.preparedDate}</Text>
          </View>
        </View>
        <View style={s.meta}>
          <Text>Prepared for {data.patientName}</Text>
          <Text>DOB {data.patientDob}</Text>
        </View>
        <View style={{ marginTop: 14 }}>
          {data.items.map((it, i) => (
            <View key={i} style={s.item}>
              <Text style={s.itemName}>{i + 1}  {it.name}</Text>
              <Text style={s.small}>{it.brand}{it.packageSize ? ` · ${it.packageSize}` : ""}</Text>
              {it.dosing ? <Text style={s.small}>How to take: {it.dosing}</Text> : null}
              {it.alternativeName ? <Text style={s.alt}>You can take this or, if you prefer, {it.alternativeName}.</Text> : null}
              {it.suppliers.length > 0 ? <Text style={s.small}>Order: {it.suppliers.map((sp) => `${sp.label} (${sp.url})`).join("  ·  ")}</Text> : null}
            </View>
          ))}
        </View>
        <Text style={s.footer}>
          This plan was prepared by your practitioner for your personal use and reflects your consultation.
          It is not a substitute for medical advice. Please tell your practitioner about any medications or changes to your health.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPlanPdf(data: PlanPdfData): Promise<Buffer> {
  return renderToBuffer(<PlanDoc data={data} />);
}
