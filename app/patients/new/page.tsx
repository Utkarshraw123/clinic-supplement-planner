import { requireUser } from "@/lib/auth/current-user";
import { createPatientAction } from "@/app/patients/actions";

export default async function NewPatientPage() {
  await requireUser();
  return (
    <main style={{ maxWidth: 480, margin: "40px auto" }}>
      <h1 style={{ fontWeight: 500 }}>New patient</h1>
      <form action={createPatientAction} style={{ display: "grid", gap: 8 }}>
        <input name="name" placeholder="Full name" required />
        <input name="dob" type="date" required />
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
