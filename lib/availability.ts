import { query, execute } from "@/lib/db";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type AvailabilityWindow = { id: number; weekday: number; start_time: string; end_time: string };

export async function addAvailabilityWindow(input: { weekday: number; startTime: string; endTime: string }): Promise<number> {
  const rs = await execute(
    "INSERT INTO availability (weekday, start_time, end_time) VALUES (?, ?, ?)",
    [input.weekday, input.startTime, input.endTime]
  );
  return Number(rs.lastInsertRowid);
}

export async function listAvailability(): Promise<AvailabilityWindow[]> {
  return query<AvailabilityWindow>("SELECT id, weekday, start_time, end_time FROM availability ORDER BY weekday, start_time");
}

export async function removeAvailabilityWindow(id: number): Promise<void> {
  await execute("DELETE FROM availability WHERE id = ?", [id]);
}

function at(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

export function computeSlots(input: {
  date: string; durationMinutes: number;
  windows: { start_time: string; end_time: string }[];
  booked: { start: string; end: string }[];
  stepMinutes?: number; now?: Date;
}): string[] {
  const step = (input.stepMinutes ?? input.durationMinutes) * 60 * 1000;
  const durMs = input.durationMinutes * 60 * 1000;
  const now = input.now ?? new Date();
  const booked = input.booked.map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  const out: string[] = [];
  for (const w of input.windows) {
    const windowStart = at(input.date, w.start_time).getTime();
    const windowEnd = at(input.date, w.end_time).getTime();
    for (let s = windowStart; s + durMs <= windowEnd; s += step) {
      const e = s + durMs;
      if (s <= now.getTime()) continue;
      const overlaps = booked.some((b) => s < b.e && e > b.s);
      if (!overlaps) out.push(new Date(s).toISOString());
    }
  }
  return out.sort();
}

export async function getOpenSlots(date: string, durationMinutes: number): Promise<string[]> {
  const weekday = at(date, "00:00").getDay();
  const windows = (await listAvailability()).filter((w) => w.weekday === weekday);
  const dayStart = at(date, "00:00").toISOString();
  const dayEnd = at(date, "23:59").toISOString();
  const booked = await query<{ start: string; end: string }>(
    "SELECT starts_at AS start, ends_at AS end FROM appointments WHERE status = 'booked' AND starts_at >= ? AND starts_at <= ?",
    [dayStart, dayEnd]
  );
  return computeSlots({ date, durationMinutes, windows, booked });
}
