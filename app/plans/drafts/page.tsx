import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listDraftPlans } from "@/lib/plans";
import { duplicatePlanAction } from "@/app/plan/actions";
import PageHeader from "@/components/PageHeader";
import DeleteDraftButton from "@/components/DeleteDraftButton";

function ago(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (Number.isNaN(days)) return iso.slice(0, 10);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return iso.slice(0, 10);
}

export default async function DraftsPage() {
  await requireUser();
  const drafts = await listDraftPlans();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader
        eyebrow="Housekeeping"
        title="Draft plans"
        subtitle={`${drafts.length} plan${drafts.length === 1 ? "" : "s"} on hold`}
        actions={<Link href="/dashboard" className="btn btn--on-dark">← Dashboard</Link>}
      />

      <div className="card">
        {drafts.length === 0 ? (
          <p className="muted">No drafts on hold — every plan has been sent or cleared. Nice and tidy.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th className="num">Items</th>
                  <th>Last updated</th>
                  <th>Built by</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.planId}>
                    <td>
                      <Link href={`/plan/${d.patientId}?plan=${d.planId}`} style={{ fontWeight: 500, color: "var(--brand-ink)" }}>
                        {d.patientName}
                      </Link>
                    </td>
                    <td className="num">{Number(d.itemCount)}</td>
                    <td className="muted-xs">{ago(d.updatedAt)}</td>
                    <td className="muted-xs">{d.authorName ?? "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <Link href={`/plan/${d.patientId}?plan=${d.planId}`} className="btn btn--sm btn--primary">Open &amp; send</Link>
                        <form action={duplicatePlanAction}>
                          <input type="hidden" name="sourcePlanId" value={d.planId} />
                          <input type="hidden" name="patientId" value={d.patientId} />
                          <button type="submit" className="btn--sm" title="Copy into another new draft">Duplicate</button>
                        </form>
                        <DeleteDraftButton planId={d.planId} patientName={d.patientName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted-xs">Open a draft to finish writing its guide and send it, or delete drafts you no longer need. Empty drafts are created automatically when you first open a patient’s plan — clearing them here is safe.</p>
    </div>
  );
}
