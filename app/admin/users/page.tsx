import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/users";
import { addUserAction, removeUserAction, updateUserAction } from "./actions";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <div>
        <h1>Team members</h1>
        <p className="muted" style={{ marginTop: 2 }}>Edit a member’s details inline, or add a new one. They set their own password from the Account page.</p>
      </div>

      <div className="card">
        {users.map((u) => (
          <div key={u.id} className="user-row">
            <form action={updateUserAction} className="user-edit">
              <input type="hidden" name="id" value={u.id} />
              <label className="field">
                <span className="field__label">Full name</span>
                <input name="name" defaultValue={u.name} required />
              </label>
              <label className="field">
                <span className="field__label">Email or username</span>
                <input name="email" type="text" defaultValue={u.email} required />
              </label>
              <label className="field" style={{ maxWidth: 120 }}>
                <span className="field__label">Role</span>
                <select name="role" defaultValue={u.role} disabled={u.id === me.userId}>
                  <option value="team">Team</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {u.id === me.userId && <input type="hidden" name="role" value={u.role} />}
              <button type="submit" className="btn--sm btn--primary">Save</button>
            </form>
            {u.id !== me.userId && (
              <form action={removeUserAction}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn--sm">Remove</button>
              </form>
            )}
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
