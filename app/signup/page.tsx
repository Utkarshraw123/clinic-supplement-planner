"use client";
import { useFormState, useFormStatus } from "react-dom";
import { signupAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ width: "100%", padding: 10, marginTop: 12 }}>
      {pending ? "Creating your clinic…" : "Create clinic account"}
    </button>
  );
}

export default function SignupPage() {
  const [state, action] = useFormState(signupAction, {} as { error?: string });
  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Create your clinic</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>Start your 14-day free trial.</p>
      <form action={action}>
        <label>Clinic name<input name="clinicName" required style={{ width: "100%", padding: 8 }} /></label>
        <label>Your name<input name="ownerName" required style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        <label>Email<input name="email" type="email" required style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        <label>Password<input name="password" type="password" required minLength={6} style={{ width: "100%", padding: 8, marginTop: 8 }} /></label>
        {state?.error ? <p style={{ color: "#b00", marginTop: 8 }}>{state.error}</p> : null}
        <Submit />
      </form>
      <p style={{ marginTop: 16 }}><a href="/login">Already have an account? Sign in →</a></p>
    </main>
  );
}
