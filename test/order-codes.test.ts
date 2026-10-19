import { describe, it, expect } from "vitest";
import { ORDER_DEFAULT, ORDER_NONE, storedFromFormValue, formValueFromStored, resolveOrderCode } from "@/lib/order-codes";

describe("order codes", () => {
  it("maps dropdown values to stored values", () => {
    expect(storedFromFormValue(ORDER_DEFAULT)).toBeNull();
    expect(storedFromFormValue("")).toBeNull();
    expect(storedFromFormValue(ORDER_NONE)).toBe("");
    expect(storedFromFormValue(" WN10 ")).toBe("WN10");
  });
  it("maps stored values back to dropdown values", () => {
    expect(formValueFromStored(null)).toBe(ORDER_DEFAULT);
    expect(formValueFromStored("")).toBe(ORDER_NONE);
    expect(formValueFromStored("WN10")).toBe("WN10");
  });
  it("resolves what prints on the plan", () => {
    expect(resolveOrderCode(null, "BRAND20")).toBe("BRAND20");
    expect(resolveOrderCode(null, null)).toBe("");
    expect(resolveOrderCode("", "BRAND20")).toBe("");
    expect(resolveOrderCode("WN10", "BRAND20")).toBe("WN10");
  });
});
