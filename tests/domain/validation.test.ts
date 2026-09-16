import { describe, expect, it } from "vitest";
import {
  ledgerInvariants,
  ledgerWithCandidate,
  ledgerWithout,
  validateLedgerChronology,
  validateLedgerIntegrity,
  validateTransaction,
} from "@/domain/validation";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/domain/categories";
import { at, emptyData, makeBudget, makeTarget, makeTx, makeWallet } from "../fixtures";

/**
 * Spec §37–§45 — validation rules that protect the ledger's history.
 */

const walletsWith = (...ids: string[]) => ids.map((id) => makeWallet(id, { name: id.toUpperCase() }));

describe("validateLedgerChronology (walk in order, refuse any negative moment)", () => {
  it("accepts money arriving before it is spent", () => {
    const result = validateLedgerChronology(
      [
        makeTx({ id: "a", type: "income", amount: 100_000, destinationWalletId: "w1", date: at(2026, 8, 1, 9) }),
        makeTx({ id: "b", type: "expense", amount: 100_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 10) }),
      ],
      { wallets: walletsWith("w1") },
    );
    expect(result.valid).toBe(true);
  });

  it("rejects spending money that only arrives later", () => {
    const result = validateLedgerChronology(
      [
        makeTx({ id: "a", type: "expense", amount: 100_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 9) }),
        makeTx({ id: "b", type: "income", amount: 100_000, destinationWalletId: "w1", date: at(2026, 8, 1, 10) }),
      ],
      { wallets: walletsWith("w1") },
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({ transactionId: "a", balanceAfter: -100_000, walletId: "w1" });
    expect(result.error?.message).toMatch(/w1/i);
  });

  it("allows an expense covered by income at the exact same instant (createdAt breaks the tie)", () => {
    const same = at(2026, 8, 1, 9);
    const income = makeTx({ id: "a", type: "income", amount: 100_000, destinationWalletId: "w1", date: same, createdAt: at(2026, 8, 1, 9) });
    const expense = makeTx({
      id: "b",
      type: "expense",
      amount: 100_000,
      sourceWalletId: "w1",
      categoryId: "makanan",
      date: same,
      createdAt: at(2026, 8, 1, 9, 1),
    });
    expect(validateLedgerChronology([expense, income], { wallets: walletsWith("w1") }).valid).toBe(true);
    // reverse the creation order and the expense lands first -> invalid
    expect(
      validateLedgerChronology(
        [income, { ...expense, createdAt: at(2026, 8, 1, 8), id: "b0" }],
        { wallets: walletsWith("w1") },
      ).valid,
    ).toBe(false);
  });

  it("walks savings balances too", () => {
    const result = validateLedgerChronology(
      [
        makeTx({
          id: "w",
          type: "savings_withdrawal",
          amount: 50_000,
          savingsTargetId: "s1",
          destinationWalletId: "w1",
          date: at(2026, 8, 1),
        }),
      ],
      { wallets: walletsWith("w1"), savingsTargets: [makeTarget("s1")] },
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.savingsTargetId).toBe("s1");
    expect(result.error?.message).toMatch(/s1|tabungan/i);
  });

  it("treats a transfer as money leaving and arriving on the same record", () => {
    const okResult = validateLedgerChronology(
      [
        makeTx({ id: "o", type: "opening_balance", amount: 100_000, destinationWalletId: "w1", date: at(2026, 8, 1) }),
        makeTx({ id: "t", type: "transfer", amount: 100_000, sourceWalletId: "w1", destinationWalletId: "w2", date: at(2026, 8, 2) }),
      ],
      { wallets: walletsWith("w1", "w2") },
    );
    expect(okResult.valid).toBe(true);

    const badResult = validateLedgerChronology(
      [makeTx({ id: "t", type: "transfer", amount: 10_000, sourceWalletId: "w1", destinationWalletId: "w2", date: at(2026, 8, 2) })],
      { wallets: walletsWith("w1", "w2") },
    );
    expect(badResult.valid).toBe(false);
  });

  it("does not let an unrelated wallet's money cover an outflow", () => {
    const result = validateLedgerChronology(
      [
        makeTx({ id: "a", type: "opening_balance", amount: 100_000, destinationWalletId: "w2", date: at(2026, 8, 1) }),
        makeTx({ id: "b", type: "expense", amount: 100_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 2) }),
      ],
      { wallets: walletsWith("w1", "w2") },
    );
    expect(result.valid).toBe(false);
  });

  it("ignores the ordering of the input array (it sorts first)", () => {
    const ledger = [
      makeTx({ id: "a", type: "income", amount: 100_000, destinationWalletId: "w1", date: at(2026, 8, 1) }),
      makeTx({ id: "b", type: "expense", amount: 100_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 5) }),
    ];
    expect(validateLedgerChronology(ledger, { wallets: walletsWith("w1") }).valid).toBe(true);
    expect(validateLedgerChronology([...ledger].reverse(), { wallets: walletsWith("w1") }).valid).toBe(true);
  });
});

describe("validateTransaction (single record rules)", () => {
  // The fixture ledger starts each wallet with plenty of money, so the only thing
  // a test can trip on is the rule it is actually about.
  const seed = [
    makeTx({ id: "seed-w1", type: "opening_balance", amount: 100_000_000, destinationWalletId: "w1", date: at(2026, 1, 1) }),
    makeTx({ id: "seed-w2", type: "opening_balance", amount: 100_000_000, destinationWalletId: "w2", date: at(2026, 1, 1) }),
    makeTx({ id: "seed-s1", type: "savings_deposit", amount: 1_000_000, sourceWalletId: "w1", savingsTargetId: "s1", date: at(2026, 1, 1) }),
  ];
  const context = (extra: Record<string, unknown> = {}) => ({
    wallets: walletsWith("w1", "w2"),
    savingsTargets: [makeTarget("s1", 1_000_000)],
    transactions: seed,
    now: new Date(at(2026, 9, 1)),
    ...extra,
  });

  const check = (transaction: never, ctx?: never) =>
    validateTransaction(transaction, ctx ?? (context() as never)) as
      | { ok: true; value: unknown }
      | { ok: false; error: { code: string; field?: string; message: string } };

  it("requires a destination wallet for income / opening balance", () => {
    expect(check(makeTx({ id: "t", type: "income", amount: 1_000 }) as never).ok).toBe(false);
    const result = check(makeTx({ id: "t", type: "income", amount: 1_000 }) as never);
    if (!result.ok) expect(result.error.field).toBe("wallet");
  });

  it("requires a source wallet for expense / transfer / deposit", () => {
    expect(check(makeTx({ id: "t", type: "expense", amount: 1_000, categoryId: "makanan" }) as never).ok).toBe(false);
    expect(check(makeTx({ id: "t", type: "transfer", amount: 1_000, destinationWalletId: "w2" }) as never).ok).toBe(false);
    expect(check(makeTx({ id: "t", type: "savings_deposit", amount: 1_000, savingsTargetId: "s1" }) as never).ok).toBe(false);
  });

  it("rejects source === destination", () => {
    const result = check(
      makeTx({ id: "t", type: "transfer", amount: 1_000, sourceWalletId: "w1", destinationWalletId: "w1" }) as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SOURCE_EQUALS_DESTINATION");
  });

  it("rejects an income that also names a source wallet", () => {
    const result = check(
      makeTx({ id: "t", type: "income", amount: 1_000, destinationWalletId: "w1", sourceWalletId: "w2" }) as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNEXPECTED_FIELD");
  });

  it("rejects unknown category ids and mismatched category sides", () => {
    expect(
      check(makeTx({ id: "t", type: "expense", amount: 1_000, sourceWalletId: "w1", categoryId: "nope" }) as never).ok,
    ).toBe(false);
    const mismatch = check(
      makeTx({ id: "t", type: "expense", amount: 1_000, sourceWalletId: "w1", categoryId: "gaji" }) as never,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error.code).toBe("CATEGORY_TYPE_MISMATCH");
    // the mirror case: an income in an expense category
    expect(
      check(makeTx({ id: "t", type: "income", amount: 1_000, destinationWalletId: "w1", categoryId: "makanan" }) as never).ok,
    ).toBe(false);
  });

  it("accepts every category of its own side", () => {
    const date = at(2026, 8, 1);
    for (const category of EXPENSE_CATEGORIES) {
      const result = check(
        makeTx({ id: "t", type: "expense", amount: 1_000, sourceWalletId: "w1", categoryId: category.id, date }) as never,
      );
      if (!result.ok) throw new Error(`${category.id}: ${result.error.code} ${result.error.message}`);
      expect(result.ok, `${category.id} should be usable for an expense`).toBe(true);
    }
    for (const category of INCOME_CATEGORIES) {
      const result = check(
        makeTx({ id: "t", type: "income", amount: 1_000, destinationWalletId: "w1", categoryId: category.id, date }) as never,
      );
      if (!result.ok) throw new Error(`${category.id}: ${result.error.code} ${result.error.message}`);
      expect(result.ok, `${category.id} should be usable for an income`).toBe(true);
    }
  });

  it("rejects amounts outside the money model", () => {
    for (const amount of [0, -1, 1.5, 10_000_000_000]) {
      const result = check(
        makeTx({ id: "t", type: "expense", amount, sourceWalletId: "w1", categoryId: "makanan" }) as never,
      );
      expect(result.ok, `amount ${amount}`).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_AMOUNT");
    }
  });

  it("checks the balance available at that moment, not the current balance", () => {
    const ledger = [
      makeTx({ id: "o", type: "opening_balance", amount: 100_000, destinationWalletId: "w1", date: at(2026, 8, 1) }),
      makeTx({ id: "x", type: "expense", amount: 90_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 2) }),
    ];
    // 20.000 left today, but only 100.000 was available on Aug 1
    const early = check(
      makeTx({ id: "n", type: "expense", amount: 50_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 12) }) as never,
      context({ transactions: ledgerWithCandidate(ledger, makeTx({ id: "n", type: "expense", amount: 50_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 12) })) }) as never,
    );
    expect(early.ok).toBe(true);

    const tooMuch = check(
      makeTx({ id: "n2", type: "expense", amount: 150_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 12) }) as never,
      context({ transactions: ledgerWithCandidate(ledger, makeTx({ id: "n2", type: "expense", amount: 150_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 8, 1, 12) })) }) as never,
    );
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.error.code).toBe("INSUFFICIENT_WALLET_BALANCE");
  });

  it("rejects a withdrawal beyond the savings balance at that moment", () => {
    const ledger = [
      makeTx({ id: "d", type: "savings_deposit", amount: 40_000, sourceWalletId: "w1", savingsTargetId: "s1", date: at(2026, 8, 1) }),
    ];
    const result = validateTransaction(
      makeTx({
        id: "n",
        type: "savings_withdrawal",
        amount: 60_000,
        destinationWalletId: "w1",
        savingsTargetId: "s1",
        date: at(2026, 8, 2),
      }),
      { ...context(), transactions: ledgerWithCandidate(ledger, ledger[0]!) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_SAVINGS_BALANCE");
  });

  it("rejects archived wallets as the destination of new money", () => {
    const archived = [makeWallet("w1", { archivedAt: at(2026, 7, 1) }), makeWallet("w2")];
    const result = validateTransaction(
      makeTx({ id: "t", type: "income", amount: 1_000, destinationWalletId: "w1", date: at(2026, 8, 1) }),
      { wallets: archived, savingsTargets: [], transactions: [], now: new Date(at(2026, 9, 1)) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DESTINATION_ARCHIVED");
  });

  it("rejects a future date but not today", () => {
    const now = new Date(at(2026, 9, 1, 12));
    expect(
      validateTransaction(
        makeTx({ id: "t", type: "expense", amount: 1_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 9, 2) }),
        { ...context(), now },
      ).ok,
    ).toBe(false);
    expect(
      validateTransaction(
        makeTx({ id: "t", type: "expense", amount: 1_000, sourceWalletId: "w1", categoryId: "makanan", date: at(2026, 9, 1, 6) }),
        { wallets: walletsWith("w1"), savingsTargets: [], transactions: [makeTx({ id: "o", type: "opening_balance", amount: 100_000, destinationWalletId: "w1" })], now },
      ).ok,
    ).toBe(true);
  });
});

describe("ledgerInvariants / validateLedgerIntegrity (structural cross checks)", () => {
  it("flags duplicate ids across records", () => {
    const data = emptyData({
      wallets: [makeWallet("same"), makeWallet("same")],
    });
    const errors = ledgerInvariants(data);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe("DUPLICATE_ID");
  });

  it("flags transactions pointing at a missing wallet", () => {
    const data = emptyData({
      wallets: [makeWallet("w1")],
      transactions: [makeTx({ id: "t1", type: "expense", amount: 1_000, sourceWalletId: "ghost", categoryId: "makanan" })],
    });
    const errors = ledgerInvariants(data);
    expect(errors.some((error) => error.code === "UNKNOWN_WALLET")).toBe(true);
  });

  it("flags duplicate budget keys (same category + month)", () => {
    const data = emptyData({
      budgets: [makeBudget("makanan", "2026-08", 100_000), makeBudget("makanan", "2026-08", 200_000, { id: "other" })],
    });
    expect(ledgerInvariants(data).some((error) => error.code === "DUPLICATE_BUDGET")).toBe(true);
  });

  it("validateLedgerIntegrity rejects a dataset whose balances dip negative", () => {
    const data = emptyData({
      wallets: [makeWallet("w1")],
      transactions: [makeTx({ id: "t1", type: "expense", amount: 5_000, sourceWalletId: "w1", categoryId: "makanan" })],
    });
    const result = validateLedgerIntegrity(data);
    expect(result.ok).toBe(false);
  });

  it("validateLedgerIntegrity accepts a clean dataset", () => {
    const data = emptyData({
      wallets: [makeWallet("w1")],
      transactions: [
        makeTx({ id: "o", type: "opening_balance", amount: 5_000, destinationWalletId: "w1" }),
        makeTx({ id: "t1", type: "expense", amount: 5_000, sourceWalletId: "w1", categoryId: "makanan" }),
      ],
    });
    expect(validateLedgerIntegrity(data).ok).toBe(true);
  });
});

describe("candidate ledger helpers", () => {
  it("ledgerWithout removes exactly one record", () => {
    const ledger = [makeTx({ id: "a" }), makeTx({ id: "b" })];
    expect(ledgerWithout(ledger, "a").map((t) => t.id)).toEqual(["b"]);
    expect(ledgerWithout(ledger, "missing")).toHaveLength(2);
  });

  it("ledgerWithCandidate replaces the stored version instead of duplicating it", () => {
    const stored = [makeTx({ id: "a", amount: 1_000, date: at(2026, 8, 1) })];
    const candidate = makeTx({ id: "a", amount: 2_000, date: at(2026, 8, 2) });
    const merged = ledgerWithCandidate(stored, candidate);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.amount).toBe(2_000);
    expect(stored[0]?.amount).toBe(1_000); // input never mutated
  });

  it("ledgerWithCandidate keeps a deterministic order", () => {
    const stored = [makeTx({ id: "a", date: at(2026, 8, 1) }), makeTx({ id: "c", date: at(2026, 8, 3) })];
    const merged = ledgerWithCandidate(stored, makeTx({ id: "b", date: at(2026, 8, 2) }));
    expect(merged.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
