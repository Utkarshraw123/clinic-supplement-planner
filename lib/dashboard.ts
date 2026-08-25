import { query } from "@/lib/db";

export type DashboardStats = { patientCount: number; draftPlans: number; plansSentThisWeek: number; plansSentAllTime: number };

export async function getDashboardStats(): Promise<DashboardStats> {
  const one = async (sql: string, args: (string | number)[] = []) => Number((await query<{ n: number }>(sql, args))[0]?.n ?? 0);
  return {
    patientCount: await one("SELECT COUNT(*) AS n FROM patients"),
    draftPlans: await one("SELECT COUNT(*) AS n FROM plans WHERE status = 'draft'"),
    plansSentThisWeek: await one("SELECT COUNT(*) AS n FROM plan_snapshots WHERE sent_at >= datetime('now', '-7 days')"),
    plansSentAllTime: await one("SELECT COUNT(*) AS n FROM plan_snapshots WHERE sent_at IS NOT NULL"),
  };
}

export async function recentPatients(limit = 6): Promise<{ id: number; name: string; dob: string }[]> {
  return query("SELECT id, name, dob FROM patients ORDER BY id DESC LIMIT ?", [limit]);
}

export async function recentlySent(limit = 6): Promise<{ snapshotId: number; patientName: string; sentAt: string | null; email: string | null }[]> {
  return query(
    `SELECT s.id AS snapshotId, pt.name AS patientName, s.sent_at AS sentAt, s.sent_to_email AS email
     FROM plan_snapshots s JOIN plans p ON p.id = s.plan_id JOIN patients pt ON pt.id = p.patient_id
     WHERE s.sent_at IS NOT NULL ORDER BY s.created_at DESC LIMIT ?`, [limit]
  );
}
