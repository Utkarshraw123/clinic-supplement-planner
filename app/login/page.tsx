"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) { router.push("/dashboard"); router.refresh(); }
    else setError((await res.json()).error ?? "Login failed");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--cream)" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 27, fontWeight: 600, color: "var(--brand-ink)", lineHeight: 1.15, textWrap: "balance", maxWidth: 340, marginInline: "auto" }}>Welcome to Lorna&apos;s world of nutrition</div>
          <p className="muted" style={{ marginTop: 8 }}>Personalised supplement plans, thoughtfully made.</p>
        </div>
        <div className="card card--plain card--pad-lg" style={{ boxShadow: "var(--shadow-md)" }}>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sign in</h1>
          <p className="muted" style={{ marginBottom: 20 }}>Welcome back.</p>
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <label className="stack" style={{ gap: 6 }}>
              <span>Email or username</span>
              <input type="text" autoComplete="username" placeholder="lorna123 or name@clinic.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="stack" style={{ gap: 6 }}>
              <span>Password</span>
              <input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <button type="submit" className="btn--primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
