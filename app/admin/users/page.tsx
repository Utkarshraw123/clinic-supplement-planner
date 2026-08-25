import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/users";
import { addUserAction, removeUserAction } from "./actions";

export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
      <h1>Team members</h1>
      <div className="card">
        {users.map((u) => (
          <div key={u.id} className="list-row">
            <span><span style={{ fontWeight: 500 }}>{u.name}</span> <span className="muted-xs">{u.email}</span></span>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`badge ${u.role === "admin" ? "" : "badge--neutral"}`}>{u.role}</span>
              <form action={removeUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn--sm">Remove</button></form>
            </span>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Add member</h2>
        <form action={addUserAction} className="stack" style={{ gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="stack" style={{ gap: 5 }}><span>Full name</span><input name="name" required /></label>
            <label className="stack" style={{ gap: 5 }}><span>Email</span><input name="email" type="email" required /></label>
            <label className="stack" style={{ gap: 5 }}><span>Temporary password</span><input name="password" type="password" required /></label>
            <label className="stack" style={{ gap: 5 }}><span>Role</span>
              <select name="role" defaultValue="team"><option value="team">Team</option><option value="admin">Admin</option></select>
            </label>
          </div>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Add member</button>
        </form>
      </div>
    </div>
  );
}
