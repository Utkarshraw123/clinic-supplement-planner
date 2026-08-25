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
