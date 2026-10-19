import { describe, it, expect } from "vitest";
import { formatDuration, formatConsultationDate } from "@/lib/format";
import { DURATION_OPTIONS } from "@/lib/durations";

describe("formatDuration", () => {
  it("prefixes lengths of time with 'for'", () => {
    expect(formatDuration("3 months")).toBe("for 3 months");
    expect(formatDuration(" 1 week ")).toBe("for 1 week");
  });
  it("prints non-time options verbatim", () => {
    expect(formatDuration("Finish off, no repeat")).toBe("Finish off, no repeat");
    expect(formatDuration("See notes below")).toBe("See notes below");
  });
  it("returns empty for blank/null", () => {
    expect(formatDuration("")).toBe("");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
  });
  it("offers 'See notes below' in the Duration dropdown", () => {
    expect(DURATION_OPTIONS).toContain("See notes below");
  });
});

describe("formatConsultationDate", () => {
  it("formats ISO dates as '26 August 2026'", () => {
    expect(formatConsultationDate("2026-08-26")).toBe("26 August 2026");
    expect(formatConsultationDate("2026-01-05")).toBe("5 January 2026");
  });
  it("returns non-ISO text unchanged and never adds a time", () => {
    expect(formatConsultationDate("3 September 2026")).toBe("3 September 2026");
    expect(formatConsultationDate("2026-13-40")).toBe("2026-13-40");
  });
  it("returns empty for blank/null", () => {
    expect(formatConsultationDate("")).toBe("");
    expect(formatConsultationDate(null)).toBe("");
  });
});
