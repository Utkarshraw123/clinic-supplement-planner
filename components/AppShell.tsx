import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClinicSettings } from "@/lib/settings";
import SidebarNav, { type NavItem } from "@/components/SidebarNav";
import SignOutButton from "@/components/SignOutButton";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const settings = await getClinicSettings();
  const clinicName = settings.clinic_name || "Supplement plans";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "home" },
    { href: "/patients", label: "Patients", icon: "users" },
    { href: "/catalog", label: "Catalog", icon: "grid" },
    { href: "/protocols", label: "Protocols", icon: "layers" },
  ];
  if (user.role === "admin") {
    items.push(
      { href: "/admin/analytics", label: "Analytics", icon: "chart" },
      { href: "/admin/notes", label: "Notes", icon: "note" },
      { href: "/admin/taxonomies", label: "Taxonomies", icon: "tag" },
      { href: "/admin/users", label: "Team", icon: "team" },
      { href: "/admin/settings", label: "Settings", icon: "cog" },
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 244,
          flexShrink: 0,
          background: "var(--brand-2)",
          color: "#fff",
          padding: "26px 16px",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <Link href="/dashboard" style={{ textDecoration: "none", color: "#fff", padding: "0 12px", marginBottom: 26, display: "block" }}>
          <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>{clinicName}</div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(224,150,120,0.95)", marginTop: 3 }}>Practitioner tools</div>
        </Link>

        <SidebarNav items={items} />

        <div style={{ marginTop: "auto", paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <Link href="/account" style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.55)", padding: "0 12px 8px", textDecoration: "none" }}>
            Signed in as <span style={{ color: "rgba(255,255,255,0.82)" }}>{user.name}</span>
          </Link>
          <div style={{ padding: "0 8px" }}><SignOutButton /></div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
