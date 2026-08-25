"use client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      style={{
        width: "100%",
        height: 36,
        fontSize: 13,
        background: "transparent",
        color: "rgba(255,255,255,0.8)",
        border: "1px solid rgba(255,255,255,0.18)",
      }}
    >
      Sign out
    </button>
  );
}
