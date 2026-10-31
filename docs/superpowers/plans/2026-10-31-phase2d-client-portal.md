# Phase 2d — Client Portal (Magic-Link Login) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A secure, passwordless client portal per clinic: a patient signs in with a one-time magic link (email), then views their plans (download PDF) and fills/edits their own intake. Portal pages are tenant-from-URL with their own session, isolated from the practitioner app.

**Architecture:** A per-tenant `portal_login_tokens` table (hashed, single-use, short-lived). `lib/portal.ts` creates + consumes tokens. `lib/auth/portal-session.ts` signs/verifies a separate `psess` JWT cookie carrying `{ tenantId, patientId }`. `lib/email.ts` gains a mock-safe `sendMagicLinkEmail`. Public `/portal/[tenant]/*` pages resolve the tenant via `getTenantDb` + `runWithDb` and do their own auth (`requirePortalPatient`). The portal home lists the patient's finalised plans (PDF download via a portal-scoped route that checks ownership) and lets them view/edit their intake (reusing `lib/intake`).

**Tech Stack:** Next.js 14 (server actions + route handler), `@libsql/client`, `jose`, `node:crypto`, `resend` (mock-safe), `vitest`.

## Global Constraints

- Portal pages have **no practitioner session** → resolve tenant from the URL and wrap all DB work in `runWithDb(await getTenantDb(slug))`.
- Magic-link tokens are **single-use, hashed at rest (sha256), expire in 30 min**. The raw token never persists.
- The `psess` cookie is **separate** from the practitioner `sess` cookie; a portal patient can only read/write their own records.
- Magic-link email is **mock-safe** (no `RESEND_API_KEY` → logs the link, `mocked: true`). The raw link is never shown in the UI in production.
- `/portal` is public in middleware (pages self-authenticate).
- No `;` inside SQL comments. Keep `npm test` green (currently 198).

---

### Task 1: Portal auth (tokens + session + magic email)

**Files:**
- Modify: `lib/schema.sql` (add `portal_login_tokens`)
- Modify: `lib/patients.ts` (`deletePatient` removes portal tokens — explicit; also cascades)
- Create: `lib/portal.ts`
- Create: `lib/auth/portal-session.ts`
- Modify: `lib/email.ts` (add `sendMagicLinkEmail`)
- Test: `test/portal-auth.test.ts`

**Interfaces:**
- Produces (`lib/portal.ts`):
  - `createPortalLoginToken(email: string): Promise<{ token: string; patientId: number } | null>` — null if no patient with that email.
  - `consumePortalLoginToken(token: string, now?: Date): Promise<number | null>` — returns patientId once, then invalidates (single-use + expiry).
- Produces (`lib/auth/portal-session.ts`):
  - `type PortalSession = { tenantId: string; patientId: number }`.
  - `signPortalSession(p: PortalSession): Promise<string>`, `verifyPortalSession(token: string): Promise<PortalSession | null>`.
- Produces (`lib/email.ts`): `sendMagicLinkEmail(input: { to: string; clinicName: string; link: string }): Promise<{ mocked: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/portal-auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createPatient } from "@/lib/patients";
import { createPortalLoginToken, consumePortalLoginToken } from "@/lib/portal";
import { signPortalSession, verifyPortalSession } from "@/lib/auth/portal-session";

describe("portal auth", () => {
  beforeAll(async () => { await runMigrations(); });

  it("issues a single-use token tied to a patient by email", async () => {
    const pid = await createPatient({ name: "Portal P", dob: "1990-01-01", email: "portal@x.test" });
    expect(await createPortalLoginToken("nobody@x.test")).toBeNull();

    const issued = await createPortalLoginToken("portal@x.test");
    expect(issued?.patientId).toBe(pid);

    // consumes once
    expect(await consumePortalLoginToken(issued!.token)).toBe(pid);
    // not reusable
    expect(await consumePortalLoginToken(issued!.token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const pid = await createPatient({ name: "Exp P", dob: "1990-01-01", email: "exp@x.test" });
    const issued = await createPortalLoginToken("exp@x.test");
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1h later > 30m expiry
    expect(await consumePortalLoginToken(issued!.token, future)).toBeNull();
    expect(pid).toBeGreaterThan(0);
  });

  it("round-trips a portal session", async () => {
    const token = await signPortalSession({ tenantId: "t1", patientId: 5 });
    expect(await verifyPortalSession(token)).toEqual({ tenantId: "t1", patientId: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/portal-auth.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Add the schema table**

In `lib/schema.sql` (after `availability` or near the other patient-scoped tables):

```sql
-- One-time, hashed, short-lived magic-link tokens for the client portal.
CREATE TABLE IF NOT EXISTS portal_login_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `lib/portal.ts`**

```ts
import { randomBytes, createHash } from "node:crypto";
import { query, execute } from "@/lib/db";
import { findPatientByEmail } from "@/lib/patients";

const TTL_MS = 30 * 60 * 1000;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPortalLoginToken(email: string): Promise<{ token: string; patientId: number } | null> {
  const patient = await findPatientByEmail(email);
  if (!patient) return null;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  await execute("INSERT INTO portal_login_tokens (patient_id, token_hash, expires_at) VALUES (?, ?, ?)", [patient.id, hash(token), expires]);
  return { token, patientId: patient.id };
}

export async function consumePortalLoginToken(token: string, now: Date = new Date()): Promise<number | null> {
  const rows = await query<{ id: number; patient_id: number; expires_at: string; used_at: string | null }>(
    "SELECT id, patient_id, expires_at, used_at FROM portal_login_tokens WHERE token_hash = ?",
    [hash(token)]
  );
  const row = rows[0];
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null;
  await execute("UPDATE portal_login_tokens SET used_at = datetime('now') WHERE id = ?", [row.id]);
  return row.patient_id;
}
```

- [ ] **Step 5: Create `lib/auth/portal-session.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

export type PortalSession = { tenantId: string; patientId: number };

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me-32-characters!");
}

export async function signPortalSession(p: PortalSession): Promise<string> {
  return new SignJWT({ ...p, kind: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyPortalSession(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "portal" || !payload.tenantId || payload.patientId == null) return null;
    return { tenantId: String(payload.tenantId), patientId: Number(payload.patientId) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Add `sendMagicLinkEmail` to `lib/email.ts`**

```ts
export async function sendMagicLinkEmail(input: { to: string; clinicName: string; link: string }): Promise<{ mocked: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] magic link for ${input.to}: ${input.link}`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: "portal@example.com",
    to: input.to,
    subject: `Sign in to ${input.clinicName}`,
    text: `Tap to sign in to your ${input.clinicName} portal:\n\n${input.link}\n\nThis link expires in 30 minutes. If you didn't request it, ignore this email.`,
  });
  return { mocked: false };
}
```

- [ ] **Step 7: Remove portal tokens on erasure**

In `lib/patients.ts` `deletePatient`, add to `stmts` before the `appointments` delete:

```ts
  stmts.push({ sql: `DELETE FROM portal_login_tokens WHERE patient_id = ?`, args: [id] });
```

- [ ] **Step 8: Run test to verify it passes + full suite + commit**

```bash
npx vitest run test/portal-auth.test.ts
npm test
git add lib/schema.sql lib/portal.ts lib/auth/portal-session.ts lib/email.ts lib/patients.ts test/portal-auth.test.ts
git commit -m "feat: client-portal auth (single-use magic-link tokens + portal session)"
```

---

### Task 2: Portal login + verify flow

**Files:**
- Create: `app/portal/[tenant]/login/page.tsx`
- Create: `app/portal/[tenant]/login/actions.ts`
- Create: `app/portal/[tenant]/verify/route.ts`
- Create: `lib/auth/portal-current.ts` (`requirePortalPatient`)
- Modify: `middleware.ts` (make `/portal` public)

**Interfaces:**
- Produces: `requestMagicLinkAction(tenant: string, formData: FormData)` — creates a token (if the email matches a patient), emails the verify link, redirects to `?sent=1`. Never reveals whether the email exists.
- Produces: `GET /portal/[tenant]/verify?token=…` — consumes the token, sets the `psess` cookie, redirects to the portal home (or back to login on failure).
- Produces: `requirePortalPatient(tenant: string): Promise<number>` — reads `psess`, verifies it, checks `tenantId` matches, returns `patientId` or `redirect` to the portal login.

- [ ] **Step 1: Create `requirePortalPatient`**

```ts
// lib/auth/portal-current.ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPortalSession } from "@/lib/auth/portal-session";

export async function requirePortalPatient(tenant: string): Promise<number> {
  const token = cookies().get("psess")?.value;
  const s = token ? await verifyPortalSession(token) : null;
  if (!s || s.tenantId !== tenant) redirect(`/portal/${tenant}/login`);
  return s!.patientId;
}
```

- [ ] **Step 2: Create the login action**

```ts
// app/portal/[tenant]/login/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { createPortalLoginToken } from "@/lib/portal";
import { sendMagicLinkEmail } from "@/lib/email";

export async function requestMagicLinkAction(tenant: string, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    const client = await getTenantDb(tenant);
    await runWithDb(client, async () => {
      const issued = await createPortalLoginToken(email);
      if (issued) {
        const base = process.env.APP_BASE_URL || "http://localhost:3200";
        const link = `${base}/portal/${tenant}/verify?token=${issued.token}`;
        const settings = await getClinicSettings();
        await sendMagicLinkEmail({ to: email, clinicName: settings.clinic_name ?? "Your clinic", link });
      }
    });
  }
  // Always report "sent" (do not reveal whether the email exists).
  redirect(`/portal/${tenant}/login?sent=1`);
}
```

- [ ] **Step 3: Create the login page**

```tsx
// app/portal/[tenant]/login/page.tsx
import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { requestMagicLinkAction } from "./actions";

export default async function PortalLoginPage({ params, searchParams }: { params: { tenant: string }; searchParams: { sent?: string; error?: string } }) {
  const tenant = params.tenant;
  let clinicName = "Our clinic";
  try {
    const client = await getTenantDb(tenant);
    clinicName = (await runWithDb(client, () => getClinicSettings())).clinic_name || clinicName;
  } catch {
    return <main style={{ maxWidth: 480, margin: "64px auto", padding: 24 }}><h1>Clinic not found</h1></main>;
  }
  return (
    <main style={{ maxWidth: 440, margin: "64px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>{clinicName} — client portal</h1>
      {searchParams.sent ? (
        <p style={{ color: "#1a7f37" }}>If that email is on file, we’ve sent a sign-in link. Check your inbox — it expires in 30 minutes.</p>
      ) : (
        <>
          {searchParams.error ? <p style={{ color: "#b00" }}>That link was invalid or expired. Please request a new one.</p> : null}
          <p style={{ color: "#555", marginBottom: 16 }}>Enter your email and we’ll send you a secure sign-in link.</p>
          <form action={requestMagicLinkAction.bind(null, tenant)} style={{ display: "grid", gap: 10, maxWidth: 360 }}>
            <input name="email" type="email" placeholder="you@email.com" required style={{ padding: 10 }} />
            <button type="submit" style={{ padding: 10 }}>Send sign-in link</button>
          </form>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Create the verify route**

```ts
// app/portal/[tenant]/verify/route.ts
import { NextResponse } from "next/server";
import { getTenantDb, runWithDb } from "@/lib/db";
import { consumePortalLoginToken } from "@/lib/portal";
import { signPortalSession } from "@/lib/auth/portal-session";

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let patientId: number | null = null;
  try {
    const client = await getTenantDb(tenant);
    patientId = await runWithDb(client, () => consumePortalLoginToken(token));
  } catch { patientId = null; }

  const base = process.env.APP_BASE_URL || new URL(req.url).origin;
  if (!patientId) return NextResponse.redirect(`${base}/portal/${tenant}/login?error=1`);

  const jwt = await signPortalSession({ tenantId: tenant, patientId });
  const res = NextResponse.redirect(`${base}/portal/${tenant}`);
  res.cookies.set("psess", jwt, { httpOnly: true, secure: true, sameSite: "lax", path: `/portal/${tenant}`, maxAge: 60 * 60 * 24 * 7 });
  return res;
}
```

- [ ] **Step 5: Make `/portal` public in middleware**

In `middleware.ts`, add `"/portal"` to `PUBLIC`.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/portal/[tenant]/login/page.tsx" "app/portal/[tenant]/login/actions.ts" "app/portal/[tenant]/verify/route.ts" lib/auth/portal-current.ts middleware.ts
git commit -m "feat: portal magic-link login + verify flow (tenant-from-URL)"
```

---

### Task 3: Portal home — plans + intake

**Files:**
- Create: `app/portal/[tenant]/page.tsx`
- Create: `app/portal/[tenant]/intake/page.tsx`
- Create: `app/portal/[tenant]/intake/actions.ts`
- Create: `app/portal/[tenant]/plan/[snapshotId]/pdf/route.ts`
- Modify: `lib/delivery.ts` (add `getSnapshotOwnerPatientId`)

**Interfaces:**
- Produces: `getSnapshotOwnerPatientId(snapshotId: number): Promise<number | null>` in `lib/delivery.ts` (snapshot → plan → patient).
- Produces: `savePortalIntakeAction(tenant: string, formData: FormData)` — saves intake for the signed-in portal patient (via `requirePortalPatient`).
- Produces: `GET /portal/[tenant]/plan/[snapshotId]/pdf` — streams the PDF only if it belongs to the signed-in portal patient.
- Consumes: `requirePortalPatient` (Task 2), `listSnapshotsForPatient`/`getSnapshotPdf` (`lib/delivery`), `getIntake`/`saveIntake` (`lib/intake`), `getPatient` (`lib/patients`).

- [ ] **Step 1: Add `getSnapshotOwnerPatientId` to `lib/delivery.ts`**

```ts
export async function getSnapshotOwnerPatientId(snapshotId: number): Promise<number | null> {
  const rows = await query<{ patient_id: number }>(
    `SELECT p.patient_id FROM plan_snapshots s JOIN plans p ON p.id = s.plan_id WHERE s.id = ?`,
    [snapshotId]
  );
  return rows[0]?.patient_id ?? null;
}
```

(Confirm `query` is imported at the top of `lib/delivery.ts`; it is used elsewhere in that file.)

- [ ] **Step 2: Create the portal home page**

```tsx
// app/portal/[tenant]/page.tsx
import Link from "next/link";
import { getTenantDb, runWithDb } from "@/lib/db";
import { getClinicSettings } from "@/lib/settings";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { getPatient } from "@/lib/patients";
import { listSnapshotsForPatient } from "@/lib/delivery";

export default async function PortalHome({ params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  const data = await runWithDb(client, async () => {
    const settings = await getClinicSettings();
    const patient = await getPatient(patientId);
    const snaps = await listSnapshotsForPatient(patientId);
    return { clinicName: settings.clinic_name || "Our clinic", name: patient?.name ?? "", snaps };
  });
  const fmt = (iso: string) => new Date(iso).toLocaleDateString();
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Welcome{data.name ? `, ${data.name.split(" ")[0]}` : ""}</h1>
      <p style={{ color: "#555" }}>Your {data.clinicName} portal.</p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Your plans</h2>
        {data.snaps.length === 0 ? <p style={{ color: "#666" }}>No plans have been shared with you yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {data.snaps.map((s) => (
              <li key={s.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between" }}>
                <span>Plan from {fmt(s.created_at)}</span>
                <a href={`/portal/${tenant}/plan/${s.id}/pdf`}>Download PDF</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Your intake</h2>
        <p><Link href={`/portal/${tenant}/intake`}>View / update your intake form →</Link></p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Create the portal intake action + page**

```ts
// app/portal/[tenant]/intake/actions.ts
"use server";
import { redirect } from "next/navigation";
import { getTenantDb, runWithDb } from "@/lib/db";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { saveIntake } from "@/lib/intake";

export async function savePortalIntakeAction(tenant: string, formData: FormData) {
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  await runWithDb(client, () => saveIntake(patientId, {
    chiefConcern: String(formData.get("chiefConcern") ?? ""),
    healthHistory: String(formData.get("healthHistory") ?? ""),
    currentMedications: String(formData.get("currentMedications") ?? ""),
    currentSupplements: String(formData.get("currentSupplements") ?? ""),
    lifestyle: String(formData.get("lifestyle") ?? ""),
    goals: String(formData.get("goals") ?? ""),
  }));
  redirect(`/portal/${tenant}`);
}
```

```tsx
// app/portal/[tenant]/intake/page.tsx
import Link from "next/link";
import { getTenantDb, runWithDb } from "@/lib/db";
import { requirePortalPatient } from "@/lib/auth/portal-current";
import { getIntake, type IntakeRow } from "@/lib/intake";
import { savePortalIntakeAction } from "./actions";

const FIELDS: { name: string; label: string; key: keyof IntakeRow }[] = [
  { name: "chiefConcern", label: "What's your main concern?", key: "chief_concern" },
  { name: "healthHistory", label: "Relevant health history", key: "health_history" },
  { name: "currentMedications", label: "Current medications", key: "current_medications" },
  { name: "currentSupplements", label: "Current supplements", key: "current_supplements" },
  { name: "lifestyle", label: "Lifestyle (diet, sleep, activity)", key: "lifestyle" },
  { name: "goals", label: "Your goals", key: "goals" },
];

export default async function PortalIntakePage({ params }: { params: { tenant: string } }) {
  const tenant = params.tenant;
  const patientId = await requirePortalPatient(tenant);
  const client = await getTenantDb(tenant);
  const intake = await runWithDb(client, () => getIntake(patientId));
  const ta = { width: "100%", minHeight: 80, padding: 8 } as const;
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <Link href={`/portal/${tenant}`}>← Back</Link>
      <h1 style={{ fontSize: 22 }}>Your intake form</h1>
      <form action={savePortalIntakeAction.bind(null, tenant)} style={{ display: "grid", gap: 10 }}>
        {FIELDS.map((f) => (
          <label key={f.name} style={{ display: "grid", gap: 4 }}>
            <span>{f.label}</span>
            <textarea name={f.name} defaultValue={(intake?.[f.key] as string | null) ?? ""} style={ta} />
          </label>
        ))}
        <button type="submit" style={{ padding: 10, justifySelf: "start" }}>Save</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Create the ownership-checked PDF route**

```ts
// app/portal/[tenant]/plan/[snapshotId]/pdf/route.ts
import { NextResponse } from "next/server";
import { getTenantDb, runWithDb } from "@/lib/db";
import { cookies } from "next/headers";
import { verifyPortalSession } from "@/lib/auth/portal-session";
import { getSnapshotOwnerPatientId, getSnapshotPdf } from "@/lib/delivery";

export async function GET(_req: Request, { params }: { params: { tenant: string; snapshotId: string } }) {
  const tenant = params.tenant;
  const token = cookies().get("psess")?.value;
  const session = token ? await verifyPortalSession(token) : null;
  if (!session || session.tenantId !== tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshotId = Number(params.snapshotId);
  const client = await getTenantDb(tenant);
  const pdf = await runWithDb(client, async () => {
    const owner = await getSnapshotOwnerPatientId(snapshotId);
    if (owner !== session.patientId) return null;
    return getSnapshotPdf(snapshotId);
  });
  if (!pdf) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(pdf, {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="plan-${snapshotId}.pdf"` },
  });
}
```

- [ ] **Step 5: Typecheck, full suite, verify in browser + commit**

```bash
npx tsc --noEmit
npm test
```
Smoke (after `npm run migrate:all`): in the app, finalise+send a plan to a patient who has an email (so a snapshot exists). Then open `/portal/<tenant>/login`, enter that email, submit → check the server log (`preview_logs`) for the `[email mock] magic link … <url>` line, open that URL → lands on the portal home → the plan is listed and the PDF downloads; "View/update intake" saves and persists. Confirm a different patient's snapshot id returns 401/404.
```bash
git add "app/portal/[tenant]/page.tsx" "app/portal/[tenant]/intake/page.tsx" "app/portal/[tenant]/intake/actions.ts" "app/portal/[tenant]/plan/[snapshotId]/pdf/route.ts" lib/delivery.ts
git commit -m "feat: portal home — view plans (owner-checked PDF) + fill intake"
```

---

## Self-Review

**Spec coverage (Phase 2d):** magic-link auth (Task 1), login/verify flow + portal session + middleware (Task 2), portal home with plans (owner-checked PDF) + patient-filled intake (Task 3). This closes Phase 2 and delivers the patient-filled intake deferred from Phase 1. ✓

**Placeholder scan:** No TBD/TODO. Complete code for new files; existing-file edits (schema, middleware, deletePatient, lib/delivery) precise.

**Type consistency:** `PortalSession` signed/verified consistently; `requirePortalPatient` returns `patientId` used by every portal page/action. Tokens hashed with the same `hash()` on create + consume. The PDF route re-checks ownership inside `runWithDb` before streaming. `IntakeRow` field keys match `lib/intake`.

**Security honored:** tokens single-use + 30-min expiry + hashed at rest; login never reveals whether an email exists; `psess` scoped to `/portal/<tenant>` path and separate from practitioner `sess`; PDF + intake gated to the signed-in patient; `/portal` public but pages self-authenticate; magic link only shown via email (mock-logged in dev).

**Phase 2 complete after this.** Next milestone = Phase 3 (AI scribe + meal plans + client invoicing), which needs its own brainstorm/spec — the AI scribe especially has regulatory nuance to decide with the user.
