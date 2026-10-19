import { describe, it, expect, beforeAll, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { userId: number; role: string } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => auth.user }));

import { runMigrations } from "@/scripts/migrate";
import { execute } from "@/lib/db";
import { createPatient } from "@/lib/patients";
import { getOrCreateDraftPlan } from "@/lib/plans";
import { GET } from "@/app/api/snapshots/[id]/docx/route";

describe("GET /api/snapshots/[id]/docx", () => {
  let snapId = 0;
  beforeAll(async () => {
    await runMigrations();
    const planId = await getOrCreateDraftPlan(await createPatient({ name: "Docx Route P", dob: "1990-01-01" }));
    const frozen = {
      clientName: "Docx Route P", consultationDate: "2026-08-26", intro: "", nextConsultation: "",
      lifestyle: "", dietary: "", supplements: [], medsText: "", notes: "", letterheadTemplate: "sage-green",
    };
    const rs = await execute("INSERT INTO plan_snapshots (plan_id, frozen_json, pdf_base64) VALUES (?, ?, '')", [planId, JSON.stringify(frozen)]);
    snapId = Number(rs.lastInsertRowid);
  });

  const call = (id: number, qs = "") =>
    GET(new Request(`http://test/api/snapshots/${id}/docx${qs}`), { params: { id: String(id) } });

  it("401 without a session", async () => {
    auth.user = null;
    expect((await call(snapId)).status).toBe(401);
  });

  it("404 for an unknown snapshot", async () => {
    auth.user = { userId: 1, role: "admin" };
    expect((await call(999999)).status).toBe(404);
  });

  it("returns a Word download for a finalised plan", async () => {
    auth.user = { userId: 1, role: "admin" };
    const res = await call(snapId, "?download=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="supplement-plan-${snapId}.docx"`);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
