import { describe, expect, it } from "vitest";
import { buildDerived } from "@/app/derived";
import { sortTransactions } from "@/domain/ledger";
import { makeTx, on, at, emptyData } from "../fixtures";

/**
 * Regression tests for Phase 2L accessibility/performance fixes.
 *
 * Ensures derived.transactionsDesc uses canonical sort ordering
 * (date → createdAt → id → type) rather than a blind .reverse().
 */
describe("derived.transactionsDesc ordering", () => {
  it("orders transactions canonically (newest first) after sort", () => {
    const data = emptyData({
      transactions: [
        // inserted out of order; same day, different ids
        makeTx({ id: "c", type: "expense", amount: 100, date: on(2026, 9, 5), createdAt: at(2026, 9, 5, 9) }),
        makeTx({ id: "a", type: "income", amount: 200, date: on(2026, 9, 5), createdAt: at(2026, 9, 5, 8) }),
        makeTx({ id: "b", type: "transfer", amount: 50, date: on(2026, 9, 4), createdAt: at(2026, 9, 4, 8) }),
      ],
    });

    const derived = buildDerived(data);
    const expected = sortTransactions(data.transactions).reverse();

    expect(derived.transactionsDesc).toEqual(expected);
    // newest first: "a" and "c" (same day) should come before "b" (older day)
    const ids = derived.transactionsDesc.map((t) => t.id);
    expect(ids[0]).toBe("c");
    expect(ids[1]).toBe("a");
    expect(ids[2]).toBe("b");
  });

  it("does not mutate the source array", () => {
    const tx = makeTx({ id: "x", type: "expense", amount: 10, date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 8) });
    const original = [...emptyData({ transactions: [tx] }).transactions];
    const data = emptyData({ transactions: [tx] });

    buildDerived(data);

    expect(data.transactions).toEqual(original);
  });
});
