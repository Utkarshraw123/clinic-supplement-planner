import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/users";
import { addUserAction, removeUserAction } from "./actions";

export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>Team members</h1>
      <ul>
        {users.map((u) => (
          <li key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span>{u.name} · {u.email} · {u.role}</span>
            <form action={removeUserAction}><input type="hidden" name="id" value={u.id} /><button>Remove</button></form>
          </li>
        ))}
      </ul>
      <form action={addUserAction} style={{ display: "grid", gap: 8, marginTop: 16 }}>
        <input name="name" placeholder="Full name" required />
        <input name="email" placeholder="name@clinic.co.uk" required />
        <input name="password" type="password" placeholder="Temporary password" required />
        <select name="role" defaultValue="team"><option value="team">Team</option><option value="admin">Admin</option></select>
        <button type="submit">Add member</button>
      </form>
    </main>
  );
}
