import { describe, expect, it } from "vitest";
import {
  amountFromMoneyInput,
  digitsFromMoneyInput,
  formatIDR,
  formatNumberGrouping,
  formatSignedIDR,
  isMoneyAmount,
  MAX_MONEY,
  parseIDRInput,
  sumAmounts,
  validateMoneyAmount,
} from "@/domain/money";

/**
 * Spec §6 — money model.
 * Amounts are positive integer Rupiah: Rp125.000 is 125000, never 125.00 and
 * never "125.000".
 */

describe("formatIDR", () => {
  it.each([
    [0, "Rp0"],
    [1, "Rp1"],
    [999, "Rp999"],
    [1000, "Rp1.000"],
    [125000, "Rp125.000"],
    [100000, "Rp100.000"],
    [1000000, "Rp1.000.000"],
    [9999999999, "Rp9.999.999.999"], // spec §55
  ])("formats %s as %s", (amount, expected) => {
    expect(formatIDR(amount)).toBe(expected);
  });

  it("never renders sen or a decimal separator", () => {
    for (const amount of [0, 1, 1000, 125000, 9999999999]) {
      expect(formatIDR(amount)).not.toContain(",");
      expect(formatIDR(amount)).not.toMatch(/Rp\d+\. \d/);
    }
  });

  it("keeps the minus sign outside the Rp prefix", () => {
    expect(formatIDR(-50000)).toBe("-Rp50.000");
  });
});

describe("formatSignedIDR", () => {
  it("signs by direction, not by stored value", () => {
    expect(formatSignedIDR(500000, "income")).toBe("+Rp500.000");
    expect(formatSignedIDR(500000, "expense")).toBe("-Rp500.000");
    expect(formatSignedIDR(50000, "expense")).toBe("-Rp50.000");
    expect(formatSignedIDR(500000, "neutral")).toBe("Rp500.000");
  });
});

describe("parseIDRInput", () => {
  it.each([
    ["125000", 125000],
    ["125.000", 125000],
    ["1.000.000", 1000000],
    ["9.999.999.999", 9999999999],
    ["125,000", 125000],
    ["1,250,000", 1250000],
    ["Rp125.000", 125000],
    ["Rp 125.000", 125000],
    ["  125.000  ", 125000],
    ["0", 0],
    ["1", 1],
    ["1000", 1000],
    ["100000", 100000],
  ])("parses %s -> %s", (input, expected) => {
    expect(parseIDRInput(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "12.5",
    "1250.50",
    "12.500.50",
    "12,50",
    "125000 sen",
    "12.00.00",
    "-12.00",
    "Rp",
    "1e6",
    "1_000",
  ])("rejects %j (returns null)", (input) => {
    expect(parseIDRInput(input)).toBeNull();
  });

  it("round-trips through formatIDR", () => {
    for (const amount of [1, 999, 1000, 123456789, MAX_MONEY]) {
      const pretty = formatIDR(amount).replace("Rp", "");
      expect(parseIDRInput(pretty)).toBe(amount);
    }
  });
});

/**
 * Regression — the amount field.
 * The display is *formatted* text (`100.000`) while the canonical amount is the
 * integer `100000`. These helpers are the projection between the two, and they must
 * never turn a grouped string into a decimal (that is what wiped amounts on mobile).
 */
describe("amount field projection (digitsFromMoneyInput / amountFromMoneyInput)", () => {
  it.each([
    ["100000", "100000"],
    ["100.000", "100000"],
    ["Rp100.000", "100000"],
    ["Rp 1.000.000", "1000000"],
    ["1,250,000", "1250000"],
    ["  100 000  ", "100000"],
    ["1.0000", "10000"], // a mobile keyboard appending to re-grouped text
    ["", ""],
    ["abc", ""],
    ["Rp", ""],
  ])("reduces %j to the digits %j", (input, digits) => {
    expect(digitsFromMoneyInput(input)).toBe(digits);
    expect(digitsFromMoneyInput(null)).toBe("");
    expect(digitsFromMoneyInput(undefined)).toBe("");
  });

  it.each([
    ["100000", 100000],
    ["100.000", 100000],
    ["Rp100.000", 100000],
    ["1.0000", 10000],
    ["9.999.999.999", MAX_MONEY],
    ["9999999999", MAX_MONEY],
    ["0", 0],
    ["1", 1],
  ])("reads %j as the integer %s", (input, amount) => {
    expect(amountFromMoneyInput(input)).toBe(amount);
  });

  it("never reads a grouping separator as a decimal point", () => {
    // parseFloat("100.000") would be 100 — IDR has no sen, so this must be 100000.
    expect(amountFromMoneyInput("100.000")).toBe(100000);
    expect(amountFromMoneyInput("1.000.000")).toBe(1000000);
    expect(formatNumberGrouping(100000)).toBe("100.000");
  });

  it.each(["", "   ", "abc", "Rp", null, undefined])("reports %j as no amount (null)", (input) => {
    expect(amountFromMoneyInput(input)).toBeNull();
  });

  it("refuses digits too large to represent exactly instead of rounding them", () => {
    expect(amountFromMoneyInput("99999999999999999999")).toBeNull();
  });

  it("round-trips the display through the projection for every magnitude", () => {
    for (const amount of [0, 1, 999, 1000, 100000, 125000, 1000000, MAX_MONEY]) {
      expect(amountFromMoneyInput(formatNumberGrouping(amount))).toBe(amount);
      // ...and the parser used by imports/other callers agrees too
      expect(parseIDRInput(formatNumberGrouping(amount))).toBe(amount);
    }
  });
});

describe("validateMoneyAmount", () => {
  it("accepts the documented minimum set", () => {
    // 0 is rejected as an *amount* (a transaction must be positive) but is a
    // valid wallet opening balance; the caller decides via its own schema.
    for (const amount of [1, 1000, 100000, 9999999999]) {
      expect(validateMoneyAmount(amount)).toEqual({ valid: true, amount });
    }
    expect(isMoneyAmount(0)).toBe(false);
    expect(isMoneyAmount(MAX_MONEY)).toBe(true);
  });

  it("rejects floats, negatives, zero and oversized amounts", () => {
    expect(validateMoneyAmount(0).valid).toBe(false);
    expect(validateMoneyAmount(-50000).valid).toBe(false);
    expect(validateMoneyAmount(125.5).valid).toBe(false);
    expect(validateMoneyAmount(10000000000).valid).toBe(false);
    expect(validateMoneyAmount(Number.NaN).valid).toBe(false);
    expect(validateMoneyAmount("125000").valid).toBe(false);
  });
});

describe("sumAmounts", () => {
  it("sums exactly in integers", () => {
    expect(sumAmounts([1000000, 500000, -100000])).toBe(1400000);
    expect(sumAmounts([])).toBe(0);
  });

  it("refuses non-integers instead of drifting", () => {
    expect(() => sumAmounts([1.5])).toThrow(TypeError);
    // Many records at the per-transaction cap still sum exactly (integer maths,
    // no float rounding), which is why 100k entries stay below MAX_SAFE_INTEGER.
    expect(sumAmounts(Array.from({ length: 100_000 }, () => MAX_MONEY))).toBe(100_000 * MAX_MONEY);
    // ...but an unbounded accumulation is refused instead of silently drifting.
    expect(() => sumAmounts([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toThrow(RangeError);
    expect(sumAmounts([MAX_MONEY, 1])).toBe(10_000_000_000);
  });
});
