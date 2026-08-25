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
    if (res.ok) { router.push("/patients"); router.refresh(); }
    else setError((await res.json()).error ?? "Login failed");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 22 }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 17 }}>S</span>
          <span style={{ fontWeight: 600, fontSize: 18 }}>Supplement plans</span>
        </div>
        <div className="card card--pad-lg">
          <h1 style={{ fontSize: 19, marginBottom: 4 }}>Sign in</h1>
          <p className="muted" style={{ marginBottom: 18 }}>Practitioner access to the clinic supplement planner.</p>
          <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 5 }}>
              <span>Email</span>
              <input type="email" placeholder="name@clinic.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="stack" style={{ gap: 5 }}>
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
