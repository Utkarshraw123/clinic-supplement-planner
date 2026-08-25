import { getCurrentUser } from "@/lib/auth/current-user";
import { getPractitionerBreakdown } from "@/lib/analytics";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  if (u.role !== "admin") return new Response("Forbidden", { status: 403 });
  const rows = await getPractitionerBreakdown();
  const csv = toCsv(rows, [
    { header: "Practitioner", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Role", value: (r) => r.role },
    { header: "Patients", value: (r) => r.patients },
    { header: "Plans built", value: (r) => r.plansBuilt },
    { header: "Finalised", value: (r) => r.plansFinalised },
    { header: "Sent", value: (r) => r.plansSent },
  ]);
  return csvResponse(csv, `practice-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
}
