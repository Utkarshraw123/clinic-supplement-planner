import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { query } from "@/lib/db";

export default async function MealPlansPage() {
  await requireUser();
  const rows = await query<{ id: number; title: string | null; status: string; patient_name: string | null }>(
    "SELECT mp.id, mp.title, mp.status, p.name AS patient_name FROM meal_plans mp LEFT JOIN patients p ON p.id = mp.patient_id WHERE mp.is_template = 0 ORDER BY mp.id DESC"
  );
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between"><h1>Meal plans</h1><Link href="/meal-plans/templates" className="btn--sm">Templates</Link></div>
      <div className="card stack" style={{ gap: 8 }}>
        {rows.length === 0 ? <p className="muted">No meal plans yet. Create one from a patient&apos;s page.</p> : rows.map((r) => (
          <Link key={r.id} href={`/meal-plans/${r.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none", borderTop: "1px solid var(--border,#eee)", paddingTop: 8 }}>
            <span>{r.title ?? "Meal plan"} · {r.patient_name ?? "—"}</span><span className="muted"><strong>{r.status}</strong></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
