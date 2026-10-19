import { describe, it, expect } from "vitest";
import { mergeSection } from "@/lib/text-merge";

describe("mergeSection", () => {
  it("fills an empty section", () => {
    expect(mergeSection("", "Eat greens")).toBe("Eat greens");
    expect(mergeSection(null, "x")).toBe("x");
  });
  it("keeps existing text when incoming is empty", () => {
    expect(mergeSection("Keep me", "")).toBe("Keep me");
    expect(mergeSection("Keep me", null)).toBe("Keep me");
  });
  it("appends below existing text with a blank line", () => {
    expect(mergeSection("First", "Second")).toBe("First\n\nSecond");
    expect(mergeSection("First\n", "  Second ")).toBe("First\n\nSecond");
  });
  it("returns empty when both are empty", () => {
    expect(mergeSection(null, undefined)).toBe("");
  });
});
