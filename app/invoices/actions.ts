"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import {
  createInvoice, updateDraft, finaliseInvoice, markPaid, voidInvoice, getInvoice, setPaymentLink,
  type InvoiceItemInput,
} from "@/lib/invoices";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { createPaymentLink } from "@/lib/billing/payment-links";
import { sendInvoiceEmail } from "@/lib/email";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

function parseItems(raw: string): InvoiceItemInput[] {
  let arr: unknown = [];
  try { arr = JSON.parse(raw || "[]"); } catch { arr = []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof (r as Record<string, unknown>).description === "string" && String((r as Record<string, unknown>).description).trim() !== "")
    .map((r) => ({
      description: String(r.description),
      quantity: Number(r.quantity) || 0,
      unitPriceCents: Math.round((Number(r.unitPrice) || 0) * 100),
      source: typeof r.source === "string" ? r.source : "free",
      appointmentId: r.appointmentId ? Number(r.appointmentId) : undefined,
      planId: r.planId ? Number(r.planId) : undefined,
    }));
}

export async function createInvoiceAction(formData: FormData) {
  const u = await requireUser();
  const patientId = Number(formData.get("patientId"));
  const id = await createInvoice(patientId, {
    items: parseItems(String(formData.get("items") || "[]")),
    dueDate: String(formData.get("dueDate") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
    createdBy: u.userId,
  });
  redirect(`/invoices/${id}`);
}

export async function saveDraftAction(id: number, formData: FormData) {
  await requireUser();
  await updateDraft(id, {
    items: parseItems(String(formData.get("items") || "[]")),
    dueDate: String(formData.get("dueDate") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
  });
  revalidatePath(`/invoices/${id}`);
}

export async function finaliseAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await finaliseInvoice(id, u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function markPaidAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await markPaid(id, "manual", u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function voidAction(id: number, _formData?: FormData) {
  const u = await requireUser();
  await voidInvoice(id, u.userId);
  revalidatePath(`/invoices/${id}`);
}

export async function createPayLinkAction(id: number, _formData?: FormData) {
  await requireUser();
  const got = await getInvoice(id);
  if (!got) return;
  const settings = await getClinicSettings();
  const { url } = await createPaymentLink({ invoice: got.invoice, key: settings.stripe_secret_key });
  await setPaymentLink(id, url);
  revalidatePath(`/invoices/${id}`);
}

export async function emailInvoiceAction(id: number, _formData?: FormData) {
  await requireUser();
  const got = await getInvoice(id);
  if (!got) return;
  const settings = await getClinicSettings();
  const patient = await getPatient(got.invoice.patient_id);
  if (!patient?.email) return;
  const pdf = await renderInvoicePdf(got.invoice, got.items, settings, patient.name);
  await sendInvoiceEmail({
    to: patient.email,
    from: settings.email_from || "",
    pdf,
    patientName: patient.name,
    number: got.invoice.number ?? String(got.invoice.id),
    payUrl: got.invoice.payment_link_url ?? undefined,
  });
  revalidatePath(`/invoices/${id}`);
}
