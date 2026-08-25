"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) router.push("/catalog");
    else setError((await res.json()).error ?? "Login failed");
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontWeight: 500 }}>Sign in</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input placeholder="name@clinic.co.uk" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p style={{ color: "#A32D2D", fontSize: 13 }}>{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
