import { describe, it, expect } from "vitest";
import { computeTotals } from "@/lib/invoices";

describe("computeTotals", () => {
  it("sums lines with rounding and applies no tax when rate is null/0", () => {
    const items = [
      { quantity: 1, unitPriceCents: 7500 },
      { quantity: 0.5, unitPriceCents: 7500 }, // 3750
      { quantity: 3, unitPriceCents: 1000 },   // 3000
    ];
    expect(computeTotals(items, null)).toEqual({ subtotalCents: 14250, taxCents: 0, totalCents: 14250 });
    expect(computeTotals(items, 0)).toEqual({ subtotalCents: 14250, taxCents: 0, totalCents: 14250 });
  });

  it("applies a VAT rate to the subtotal, rounded", () => {
    expect(computeTotals([{ quantity: 1, unitPriceCents: 10000 }], 23))
      .toEqual({ subtotalCents: 10000, taxCents: 2300, totalCents: 12300 });
  });

  it("handles an empty invoice", () => {
    expect(computeTotals([], 20)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });
});
