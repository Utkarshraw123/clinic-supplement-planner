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
          <label className="stack" style={{ gap: 5 }}><span>Email <span className="muted-xs">(used to send plans)</span></span><input name="email" type="email" placeholder="client@email.com" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Phone</span><input name="phone" placeholder="07…" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address line 1</span><input name="address1" /></label>
          <label className="stack" style={{ gap: 5 }}><span>Address line 2</span><input name="address2" /></label>
          <div className="row" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>City</span><input name="city" /></label>
            <label className="stack" style={{ gap: 5, flex: 1 }}><span>Postcode</span><input name="postcode" /></label>
          </div>
          <button type="submit" className="btn--primary" style={{ justifySelf: "start" }}>Create patient</button>
        </form>
      </div>
    </div>
  );
}
