import { requireUser } from "@/lib/auth/current-user";
import { requireActiveSubscription } from "@/lib/billing/gate";

export default async function OnboardingPage() {
  const u = await requireUser();
  await requireActiveSubscription(u.tenantId);
  const steps: { title: string; body: string; href: string; cta: string }[] = [
    { title: "Add your supplement library", body: "Upload the products you prescribe, or add them as you go.", href: "/catalog", cta: "Open catalogue" },
    { title: "Add your first patient", body: "Create a patient record to build their plan.", href: "/patients", cta: "Add patient" },
    { title: "Invite your team", body: "Add practitioners who’ll use the clinic.", href: "/admin", cta: "Team settings" },
  ];
  return (
    <main style={{ maxWidth: 680, margin: "56px auto", padding: 24 }}>
      <h1 style={{ fontSize: 26 }}>Welcome, {u.name.split(" ")[0]} 👋</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Your clinic is set up and your free trial has started. A few things to get going:</p>
      <ol style={{ display: "grid", gap: 16, listStyle: "none", padding: 0 }}>
        {steps.map((s) => (
          <li key={s.href} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>{s.title}</h2>
            <p style={{ color: "#555", margin: "6px 0 12px" }}>{s.body}</p>
            <a href={s.href} style={{ fontWeight: 600 }}>{s.cta} →</a>
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 24 }}><a href="/dashboard" style={{ fontWeight: 600 }}>Skip to dashboard →</a></p>
    </main>
  );
}
