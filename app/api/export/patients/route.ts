import { getCurrentUser } from "@/lib/auth/current-user";
import { listPatients } from "@/lib/patients";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const patients = await listPatients();
  const csv = toCsv(patients, [
    { header: "ID", value: (p) => p.id },
    { header: "Name", value: (p) => p.name },
    { header: "DOB", value: (p) => p.dob },
  ]);
  return csvResponse(csv, `patients-${new Date().toISOString().slice(0, 10)}.csv`);
}
