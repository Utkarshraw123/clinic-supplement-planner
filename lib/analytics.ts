import { query } from "@/lib/db";

// Per-practitioner activity, for the head nutritionist (admin) to oversee her team.
// Deterministic aggregation from the source tables — no derived/cached counters.
export type PractitionerMetrics = {
  userId: number;
  name: string;
  email: string;
  role: "admin" | "team";
  patients: number;      // patients this user created
  plansBuilt: number;    // plans this user authored (draft or finalised)
  plansFinalised: number;// plans finalised into a snapshot by this user
  plansSent: number;     // finalised plans this user emailed to a client
};

export type PracticeTotals = {
  patients: number;
  plansBuilt: number;
  plansFinalised: number;
  plansSent: number;
  sentLast30Days: number;
};

export async function getPractitionerBreakdown(): Promise<PractitionerMetrics[]> {
  const rows = await query<{
    userId: number; name: string; email: string; role: "admin" | "team";
    patients: number; plansBuilt: number; plansFinalised: number; plansSent: number;
  }>(
    `SELECT u.id AS userId, u.name AS name, u.email AS email, u.role AS role,
       (SELECT COUNT(*) FROM patients p WHERE p.created_by = u.id) AS patients,
       (SELECT COUNT(*) FROM plans pl WHERE pl.author_id = u.id) AS plansBuilt,
       (SELECT COUNT(*) FROM plan_snapshots s WHERE s.sent_by = u.id) AS plansFinalised,
       (SELECT COUNT(*) FROM plan_snapshots s WHERE s.sent_by = u.id AND s.sent_at IS NOT NULL) AS plansSent
     FROM users u
     ORDER BY plansSent DESC, plansBuilt DESC, u.name ASC`
  );
  return rows;
}

export async function getPracticeTotals(): Promise<PracticeTotals> {
  const one = async (sql: string) => Number((await query<{ n: number }>(sql))[0]?.n ?? 0);
  return {
    patients: await one("SELECT COUNT(*) AS n FROM patients"),
    plansBuilt: await one("SELECT COUNT(*) AS n FROM plans"),
    plansFinalised: await one("SELECT COUNT(*) AS n FROM plan_snapshots"),
    plansSent: await one("SELECT COUNT(*) AS n FROM plan_snapshots WHERE sent_at IS NOT NULL"),
    sentLast30Days: await one("SELECT COUNT(*) AS n FROM plan_snapshots WHERE sent_at >= datetime('now', '-30 days')"),
  };
}
