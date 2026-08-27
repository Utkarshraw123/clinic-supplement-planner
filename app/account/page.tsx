import { requireUser } from "@/lib/auth/current-user";
import PageHeader from "@/components/PageHeader";
import { changePasswordAction } from "./actions";

const ERRORS: Record<string, string> = {
  current: "That current password isn’t right. Try again.",
  short: "Choose a new password of at least 10 characters.",
  mismatch: "The new password and confirmation don’t match.",
  notfound: "We couldn’t find your account. Please sign in again.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const u = await requireUser();
  const ok = searchParams.ok === "1";
  const errorText = searchParams.error ? ERRORS[searchParams.error] : null;

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 560 }}>
      <PageHeader eyebrow="Account" title="Your account" subtitle={`Signed in as ${u.name}`} />

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Change password</h2>
        <p className="muted" style={{ marginBottom: 16, fontSize: 14 }}>
          Use at least 10 characters. You’ll stay signed in on this device.
        </p>

        {ok && (
          <div className="badge badge--ok" style={{ marginBottom: 14, display: "inline-block" }}>
            Password updated
          </div>
        )}
        {errorText && (
          <div className="badge badge--danger" style={{ marginBottom: 14, display: "inline-block" }}>
            {errorText}
          </div>
        )}

        <form action={changePasswordAction} className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 5 }}>
            <span>Current password</span>
            <input name="current" type="password" autoComplete="current-password" required />
          </label>
          <label className="stack" style={{ gap: 5 }}>
            <span>New password</span>
            <input name="next" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <label className="stack" style={{ gap: 5 }}>
            <span>Confirm new password</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
