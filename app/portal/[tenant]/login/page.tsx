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
