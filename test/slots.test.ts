import { describe, it, expect } from "vitest";
import { computeSlots } from "@/lib/availability";

const past = new Date("2000-01-01T00:00:00");

describe("computeSlots (pure)", () => {
  it("tiles a window into duration-sized slots", () => {
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked: [], now: past });
    expect(slots.map((s) => new Date(s).getHours())).toEqual([9, 10, 11]);
  });

  it("excludes slots overlapping a booked interval", () => {
    const booked = [{ start: new Date("2030-06-03T10:00").toISOString(), end: new Date("2030-06-03T11:00").toISOString() }];
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked, now: past });
    expect(slots.map((s) => new Date(s).getHours())).toEqual([9, 11]);
  });

  it("excludes slots that start in the past", () => {
    const slots = computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [{ start_time: "09:00", end_time: "12:00" }], booked: [], now: new Date("2030-06-03T10:30") });
    expect(slots.map((s) => new Date(s).getHours())).toEqual([11]);
  });

  it("returns nothing when there are no windows", () => {
    expect(computeSlots({ date: "2030-06-03", durationMinutes: 60, windows: [], booked: [], now: past })).toEqual([]);
  });
});
