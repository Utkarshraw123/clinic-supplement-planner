import { requireUser } from "@/lib/auth/current-user";
import { createPatientAction } from "@/app/patients/actions";

export default async function NewPatientPage() {
  await requireUser();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 460 }}>
      <h1>New patient</h1>
      <div className="card">
        <form action={createPatientAction} className="stack" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 5 }}><span>Full name</span><input name="name" placeholder="Jane Doe" required /></label>
          <label className="stack" style={{ gap: 5 }}><span>Date of birth</span><input name="dob" type="date" required /></label>
          <p className="muted-xs">Only name and date of birth are stored as identifiers.</p>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create patient</button>
        </form>
      </div>
    </div>
  );
}
