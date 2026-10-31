export async function sendPlanEmail(input: { to: string; from: string; pdf: Buffer; patientName: string }): Promise<{ mocked: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] would send plan for ${input.patientName} to ${input.to} (${input.pdf.length} bytes)`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "plans@example.com",
    to: input.to,
    subject: "Your supplement plan",
    text: `Dear ${input.patientName},\n\nPlease find your supplement plan attached.\n\nBest wishes,\nYour practitioner`,
    attachments: [{ filename: "supplement-plan.pdf", content: input.pdf.toString("base64") }],
  });
  return { mocked: false };
}

export async function sendReminderEmail(input: { to: string; from: string; clinicName: string; patientName: string; whenIso: string }): Promise<{ mocked: boolean }> {
  const when = new Date(input.whenIso).toLocaleString();
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email mock] reminder to ${input.to} for ${input.patientName} @ ${when}`);
    return { mocked: true };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: input.from || "appointments@example.com",
    to: input.to,
    subject: `Appointment reminder — ${input.clinicName}`,
    text: `Dear ${input.patientName},\n\nThis is a reminder of your appointment with ${input.clinicName} on ${when}.\n\nIf you need to reschedule, please get in touch.\n\nBest wishes,\n${input.clinicName}`,
  });
  return { mocked: false };
}
