import { query } from "@/lib/db";

export type DashboardStats = { patientCount: number; draftPlans: number; plansSentThisWeek: number; plansSentAllTime: number };

export async function getDashboardStats(): Promise<DashboardStats> {
  // One round-trip with correlated subqueries instead of four sequential COUNTs.
  const rows = await query<{ patientCount: number; draftPlans: number; sentThisWeek: number; sentAllTime: number }>(
    `SELECT
       (SELECT COUNT(*) FROM patients) AS patientCount,
       (SELECT COUNT(*) FROM plans WHERE status = 'draft') AS draftPlans,
       (SELECT COUNT(*) FROM plan_snapshots WHERE sent_at >= datetime('now', '-7 days')) AS sentThisWeek,
       (SELECT COUNT(*) FROM plan_snapshots WHERE sent_at IS NOT NULL) AS sentAllTime`
  );
  const r = rows[0] ?? { patientCount: 0, draftPlans: 0, sentThisWeek: 0, sentAllTime: 0 };
  return {
    patientCount: Number(r.patientCount),
    draftPlans: Number(r.draftPlans),
    plansSentThisWeek: Number(r.sentThisWeek),
    plansSentAllTime: Number(r.sentAllTime),
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
