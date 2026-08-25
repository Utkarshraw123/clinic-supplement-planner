import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import SignOutButton from "@/components/SignOutButton";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Login (and any unauthenticated view) renders chrome-free.
  if (!user) return <>{children}</>;

  return (
    <>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "0 24px",
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link href="/patients" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "var(--brand)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              S
            </span>
            <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: 15 }}>Supplement plans</span>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <NavLink href="/patients" label="Patients" />
            <NavLink href="/catalog" label="Catalog" />
            {user.role === "admin" && <NavLink href="/admin/settings" label="Settings" />}
            {user.role === "admin" && <NavLink href="/admin/taxonomies" label="Taxonomies" />}
            {user.role === "admin" && <NavLink href="/admin/users" label="Team" />}
            <span style={{ width: 8 }} />
            <span className="muted-xs" style={{ marginRight: 8 }}>{user.name}</span>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <div className="page">{children}</div>
    </>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 14,
        fontWeight: 500,
        color: "var(--ink-2)",
        padding: "7px 11px",
        borderRadius: 8,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}
