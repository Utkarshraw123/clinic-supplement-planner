import { describe, it, expect, beforeAll } from "vitest";
import { runMigrations } from "@/scripts/migrate";
import { addAvailabilityWindow, listAvailability, removeAvailabilityWindow } from "@/lib/availability";

describe("availability windows", () => {
  beforeAll(async () => { await runMigrations(); });

  it("adds, lists (ordered) and removes windows", async () => {
    const a = await addAvailabilityWindow({ weekday: 1, startTime: "09:00", endTime: "12:00" });
    await addAvailabilityWindow({ weekday: 1, startTime: "13:00", endTime: "17:00" });
    const list = (await listAvailability()).filter((w) => w.weekday === 1);
    expect(list.map((w) => w.start_time)).toEqual(["09:00", "13:00"]);
    await removeAvailabilityWindow(a);
    expect((await listAvailability()).some((w) => w.id === a)).toBe(false);
  });
});
