"use client";
import { useEffect, useState } from "react";

// A tiny bottom-centre toast. Any client code can trigger it with:
//   window.dispatchEvent(new CustomEvent("app:toast", { detail: "Saved" }))
export default function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener("app:toast", onToast as EventListener);
    return () => { window.removeEventListener("app:toast", onToast as EventListener); clearTimeout(timer); };
  }, []);
  if (!msg) return null;
  return <div className="toast" role="status" aria-live="polite">{msg}</div>;
}

export function toast(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("app:toast", { detail: message }));
}
