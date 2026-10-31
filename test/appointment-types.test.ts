import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { createAppointmentType, listAppointmentTypes, getAppointmentType, archiveAppointmentType } from "@/lib/appointments";

describe("appointment types", () => {
  beforeAll(async () => { await runMigrations(); });

  it("creates, lists active, fetches and archives", async () => {
    const id = await createAppointmentType({ name: "Initial consult", durationMinutes: 60, price: "£90" });
    const active = await listAppointmentTypes();
    expect(active.find((t) => t.id === id)?.name).toBe("Initial consult");
    expect((await getAppointmentType(id))?.duration_minutes).toBe(60);

    await archiveAppointmentType(id);
    expect((await listAppointmentTypes()).find((t) => t.id === id)).toBeUndefined();
    expect((await listAppointmentTypes(true)).find((t) => t.id === id)?.status).toBe("archived");
  });
});
