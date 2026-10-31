import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { MERRIWEATHER_REGULAR, MERRIWEATHER_BOLD } from "@/lib/pdf-fonts";
import { PANEL_KEYS, type PlanTree } from "@/lib/meal-plans";
import type { ClinicSettings } from "@/lib/settings";

Font.register({ family: "Merriweather", fonts: [{ src: MERRIWEATHER_REGULAR }, { src: MERRIWEATHER_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback((w) => [w]);

const GOLD = "#A17C3A"; const INK = "#2C2C2A"; const MUTED = "#6B6B63";
const LABELS: Record<string, string> = { energy_kcal: "kcal", protein_g: "P", carbs_g: "C", sugars_g: "sug", fat_g: "F", saturates_g: "sat", fibre_g: "fib", salt_g: "salt" };
const fmt = (k: string, v: number) => (k === "energy_kcal" ? Math.round(v).toString() : v.toFixed(1));

const st = StyleSheet.create({
  page: { fontFamily: "Merriweather", fontSize: 10, color: INK, padding: 44, lineHeight: 1.5 },
  h1: { fontSize: 18, fontWeight: 700, color: GOLD },
  muted: { color: MUTED },
  day: { marginTop: 14, borderTop: `1px solid ${GOLD}`, paddingTop: 8 },
  meal: { marginTop: 8 },
  mealName: { fontWeight: 700 },
  item: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2 },
  totals: { marginTop: 4, color: MUTED, fontSize: 9 },
});

export function MealPlanDoc({ tree, settings, patientName }: { tree: PlanTree; settings: ClinicSettings; patientName: string }) {
  const { plan, days } = tree;
  const targets: Record<string, number | null> = { energy_kcal: plan.target_kcal, protein_g: plan.target_protein_g, carbs_g: plan.target_carbs_g, fat_g: plan.target_fat_g, fibre_g: plan.target_fibre_g, salt_g: plan.target_salt_g };
  return (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.h1}>{settings.clinic_name || "Meal plan"}</Text>
        <Text style={st.muted}>{plan.title ?? "Meal plan"} · {patientName}</Text>
        {days.map((d) => (
          <View key={d.id} style={st.day} wrap={false}>
            <Text style={{ fontWeight: 700 }}>{d.label}</Text>
            {d.meals.map((m) => (
              <View key={m.id} style={st.meal}>
                <Text style={st.mealName}>{m.name}</Text>
                {m.items.length === 0 ? <Text style={st.muted}>—</Text> : m.items.map((it) => (
                  <View key={it.id} style={st.item}><Text>{it.label} × {it.quantity}</Text><Text style={st.muted}>{Math.round(it.nutrition.energy_kcal)} kcal</Text></View>
                ))}
              </View>
            ))}
            <Text style={st.totals}>Day total: {PANEL_KEYS.map((k) => `${LABELS[k]} ${fmt(k, d.totals[k])}${targets[k] != null ? `/${fmt(k, targets[k] as number)}` : ""}`).join(" · ")}</Text>
          </View>
        ))}
        {plan.notes ? <View style={{ marginTop: 14 }}><Text style={st.muted}>Notes</Text><Text>{plan.notes}</Text></View> : null}
      </Page>
    </Document>
  );
}

export async function renderMealPlanPdf(tree: PlanTree, settings: ClinicSettings, patientName: string): Promise<Buffer> {
  return renderToBuffer(<MealPlanDoc tree={tree} settings={settings} patientName={patientName} />);
}
