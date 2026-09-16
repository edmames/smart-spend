import { describe, expect, it } from "vitest";
import {
  calculateSavingsBalance,
  calculateTotalMoney,
  calculateWalletBalance,
  compareTransactions,
  getSavingsBalanceAtDate,
  getWalletBalanceAtDate,
  sortTransactions,
} from "@/domain/ledger";
import type { SavingsTarget, Transaction, Wallet } from "@/domain/models";

/**
 * Spec §17–§23 — ledger maths and ordering.
 * Balances are derived only; the ledger is the single source of truth.
 */

const T = "2026-01-01T00:00:00Z";

export function wallet(id: string, name = id, extra: Partial<Wallet> = {}): Wallet {
  return { id, name, type: "bank", provider: null, createdAt: T, updatedAt: T, archivedAt: null, ...extra };
}

export function target(id: string, name = id, targetAmount = 10_000_000, extra: Partial<SavingsTarget> = {}): SavingsTarget {
  return { id, name, targetAmount, deadline: null, note: null, createdAt: T, updatedAt: T, archivedAt: null, ...extra };
}

export function tx(partial: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount">): Transaction {
  return {
    categoryId: null,
    sourceWalletId: null,
    destinationWalletId: null,
    savingsTargetId: null,
    paymentMethod: null,
    note: null,
    // Financial calendar day (YYYY-MM-DD), not an instant.
    date: "2026-01-01",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T08:00:00.000Z",
    ...partial,
  } as Transaction;
}

describe("sortTransactions (deterministic ordering, spec §23)", () => {
  it("orders by date, then createdAt, then id", () => {
    const ledger = [
      tx({ id: "c", type: "expense", amount: 1, date: "2026-01-02" }),
      tx({ id: "b", type: "expense", amount: 1, date: "2026-01-01", createdAt: "2026-01-05T00:00:00.000Z" }),
      tx({ id: "a", type: "expense", amount: 1, date: "2026-01-01", createdAt: "2026-01-03T00:00:00.000Z" }),
      tx({ id: "d", type: "expense", amount: 1, date: "2026-01-01", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    expect(sortTransactions(ledger).map((t) => t.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a stable total order (input order never matters)", () => {
    const base = [
      tx({ id: "x", type: "expense", amount: 1 }),
      tx({ id: "y", type: "expense", amount: 1 }),
      tx({ id: "z", type: "expense", amount: 1 }),
    ];
    const forward = sortTransactions(base).map((t) => t.id).join(",");
    const backward = sortTransactions([...base].reverse()).map((t) => t.id).join(",");
    const shuffled = sortTransactions([base[2]!, base[0]!, base[1]!]).map((t) => t.id).join(",");
    expect(new Set([forward, backward, shuffled])).toHaveLength(1);
  });

  it("falls back to type as the last tiebreaker", () => {
    expect(compareTransactions(tx({ id: "i", type: "expense", amount: 1 }), tx({ id: "i", type: "income", amount: 1 }))).toBe(-1);
    expect(compareTransactions(tx({ id: "i", type: "transfer", amount: 1 }), tx({ id: "i", type: "expense", amount: 1 }))).toBe(1);
    expect(compareTransactions(tx({ id: "i", type: "expense", amount: 1 }), tx({ id: "i", type: "expense", amount: 1 }))).toBe(0);
  });
});

describe("calculateWalletBalance (spec §18)", () => {
  const bca = wallet("bca");

  it("matches the documented formula", () => {
    const ledger = [
      tx({ id: "1", type: "opening_balance", amount: 1_000_000, destinationWalletId: "bca" }),
      tx({ id: "2", type: "income", amount: 500_000, destinationWalletId: "bca" }),
      tx({ id: "3", type: "expense", amount: 100_000, sourceWalletId: "bca" }),
      tx({ id: "4", type: "transfer", amount: 200_000, sourceWalletId: "bca", destinationWalletId: "cash" }),
      tx({ id: "5", type: "transfer", amount: 50_000, sourceWalletId: "dana", destinationWalletId: "bca" }),
      tx({ id: "6", type: "savings_deposit", amount: 300_000, sourceWalletId: "bca", savingsTargetId: "dana" }),
      tx({ id: "7", type: "savings_withdrawal", amount: 100_000, destinationWalletId: "bca", savingsTargetId: "dana" }),
    ];
    // +1.000.000 opening +500.000 income -100.000 expense -200.000 out transfer
    // +50.000 in transfer -300.000 deposit +100.000 withdrawal
    expect(calculateWalletBalance(ledger, bca.id)).toBe(1_050_000);
  });

  it("keeps archived wallets in the calculation", () => {
    const ledger = [
      tx({ id: "1", type: "opening_balance", amount: 250_000, destinationWalletId: "old" }),
      tx({ id: "2", type: "expense", amount: 50_000, sourceWalletId: "old" }),
    ];
    expect(calculateWalletBalance(ledger, "old")).toBe(200_000);
    expect(calculateWalletBalance(ledger, wallet("old", "old", { archivedAt: T }).id)).toBe(200_000);
  });

  it("returns 0 for an unknown wallet", () => {
    expect(calculateWalletBalance([tx({ id: "1", type: "expense", amount: 10, sourceWalletId: "bca" })], "ghost")).toBe(0);
  });
});

describe("calculateSavingsBalance (spec §19)", () => {
  it("is deposits minus withdrawals only", () => {
    const ledger = [
      tx({ id: "1", type: "savings_deposit", amount: 300_000, sourceWalletId: "bca", savingsTargetId: "dana" }),
      tx({ id: "2", type: "savings_deposit", amount: 200_000, sourceWalletId: "bca", savingsTargetId: "dana" }),
      tx({ id: "3", type: "savings_withdrawal", amount: 100_000, destinationWalletId: "bca", savingsTargetId: "dana" }),
      // income assigned to the same target must NOT move savings
      tx({ id: "4", type: "income", amount: 900_000, destinationWalletId: "bca" }),
    ];
    expect(calculateSavingsBalance(ledger, "dana")).toBe(400_000);
  });

  it("may exceed the target amount", () => {
    const ledger = [tx({ id: "1", type: "savings_deposit", amount: 1_500_000, sourceWalletId: "bca", savingsTargetId: "dana" })];
    expect(calculateSavingsBalance(ledger, "dana")).toBe(1_500_000);
  });
});

describe("point-in-time balances", () => {
  const ledger = [
    tx({ id: "a", type: "opening_balance", amount: 100_000, destinationWalletId: "bca", date: "2026-01-01" }),
    tx({ id: "b", type: "expense", amount: 80_000, sourceWalletId: "bca", date: "2026-01-02" }),
    tx({ id: "c", type: "expense", amount: 5_000, sourceWalletId: "bca", date: "2026-01-03" }),
  ];

  it("returns the balance immediately before a record", () => {
    expect(getWalletBalanceAtDate(ledger, "bca", { id: "b", date: "2026-01-02" })).toBe(100_000);
    expect(getWalletBalanceAtDate(ledger, "bca", { id: "c", date: "2026-01-03" })).toBe(20_000);
  });

  it("filters by calendar day when the record is not in the ledger", () => {
    // A record dated 2026-01-03 sees everything recorded before that day.
    expect(getWalletBalanceAtDate(ledger, "bca", { id: "new", date: "2026-01-03" })).toBe(20_000);
    expect(getWalletBalanceAtDate(ledger, "bca")).toBe(15_000);
  });

  it("does the same for savings", () => {
    const savingsLedger = [
      tx({ id: "d1", type: "savings_deposit", amount: 300_000, sourceWalletId: "bca", savingsTargetId: "dana", date: "2026-01-01" }),
      tx({ id: "d2", type: "savings_withdrawal", amount: 100_000, destinationWalletId: "bca", savingsTargetId: "dana", date: "2026-01-05" }),
    ];
    expect(getSavingsBalanceAtDate(savingsLedger, "dana", { id: "d2", date: "2026-01-05" })).toBe(300_000);
  });
});

describe("calculateTotalMoney (spec §20)", () => {
  it("adds wallets and savings exactly once", () => {
    const wallets = [wallet("bca"), wallet("cash")];
    const targets = [target("dana")];
    const ledger = [
      tx({ id: "1", type: "opening_balance", amount: 600_000, destinationWalletId: "bca" }),
      tx({ id: "2", type: "transfer", amount: 300_000, sourceWalletId: "bca", destinationWalletId: "cash" }),
      tx({ id: "3", type: "savings_deposit", amount: 300_000, sourceWalletId: "cash", savingsTargetId: "dana" }),
    ];
    const totals = calculateTotalMoney(wallets, targets, ledger);
    // BCA 600.000 - 300.000 = 300.000 ; Cash 300.000 - 300.000 = 0 ; savings 300.000
    expect(totals.walletTotal).toBe(300_000);
    expect(totals.savingsTotal).toBe(300_000);
    expect(totals.total).toBe(600_000);
  });

  it("matches the worked example from the spec (Rp200k + Rp100k + Rp300k = Rp600k)", () => {
    const wallets = [wallet("bca"), wallet("cash")];
    const targets = [target("dana")];
    const ledger = [
      tx({ id: "1", type: "opening_balance", amount: 500_000, destinationWalletId: "bca" }),
      tx({ id: "2", type: "opening_balance", amount: 100_000, destinationWalletId: "cash" }),
      tx({ id: "3", type: "savings_deposit", amount: 300_000, sourceWalletId: "bca", savingsTargetId: "dana" }),
    ];
    const totals = calculateTotalMoney(wallets, targets, ledger);
    expect(totals.walletTotal).toBe(300_000); // BCA 200.000 + Cash 100.000
    expect(totals.savingsTotal).toBe(300_000);
    expect(totals.total).toBe(600_000);
  });
});
