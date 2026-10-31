import { requireUser } from "@/lib/auth/current-user";
import { getInvoice } from "@/lib/invoices";
import { getClinicSettings } from "@/lib/settings";
import { getPatient } from "@/lib/patients";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const got = await getInvoice(Number(params.id));
  if (!got) return new Response("not found", { status: 404 });
  const settings = await getClinicSettings();
  const patient = await getPatient(got.invoice.patient_id);
  const pdf = await renderInvoicePdf(got.invoice, got.items, settings, patient?.name ?? "Patient");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${got.invoice.number ?? got.invoice.id}.pdf"`,
    },
  });
}
