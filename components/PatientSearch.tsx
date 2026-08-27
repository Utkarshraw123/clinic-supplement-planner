"use client";
import { useState } from "react";
import Link from "next/link";
import { filterPatients, type PatientRow } from "@/lib/patient-search";

/**
 * Client-side search over the already-loaded patients list. The caseload is
 * small, so we filter in the browser (name or DOB) rather than hitting an API.
 */
export default function PatientSearch({ patients }: { patients: PatientRow[] }) {
  const [term, setTerm] = useState("");
  const hits = filterPatients(patients, term);
  return (
    <div className="card">
      <div style={{ position: "relative", marginBottom: 6 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-muted)", fontSize: 15 }}>⌕</span>
        <input
          placeholder="Search patients — name or date of birth…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{ paddingLeft: 32 }}
          aria-label="Search patients"
        />
      </div>
      {patients.length === 0 && <p className="muted">No patients yet. Add your first to start a plan.</p>}
      {patients.length > 0 && hits.length === 0 && (
        <p className="muted" style={{ padding: "12px 4px" }}>No patients match “{term}”.</p>
      )}
      {hits.map((p) => (
        <div key={p.id} className="list-row">
          <Link href={`/patients/${p.id}`} style={{ fontWeight: 500, color: "var(--brand-ink)" }}>{p.name}</Link>
          <span className="muted-xs">DOB {p.dob}</span>
        </div>
      ))}
    </div>
  );
}
