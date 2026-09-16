import { describe, expect, it } from "vitest";
import {
  buildWalletRows,
  calculateBudgetUsage,
  calculateBudgetUsageList,
  calculateCategoryBreakdown,
  calculateCategorySpend,
  calculateCategoryTotalsForMonth,
  calculateMonthlySummary,
  calculateMonthlyTrend,
  calculateSavingsProgress,
  currentMonthKey,
  filterTransactions,
  findDuplicateBudgetKeys,
  formatMonthLabel,
  inPeriod,
  monthKeyOf,
  rangeForPeriod,
  shiftMonthKey,
} from "@/domain/selectors";
import { at, emptyData, makeBudget, makeTarget, makeTx, makeWallet, on } from "../fixtures";

/**
 * Spec §57–§62 — reporting selectors (what every screen shows).
 */

const budgetOnlyLedger = [
  makeTx({ id: "e1", type: "expense", amount: 100_000, sourceWalletId: "w1", categoryId: "makanan", date: on(2026, 8, 3) }),
  makeTx({ id: "t1", type: "transfer", amount: 200_000, sourceWalletId: "w1", destinationWalletId: "w2", date: on(2026, 8, 4) }),
  makeTx({ id: "d1", type: "savings_deposit", amount: 300_000, sourceWalletId: "w1", savingsTargetId: "s1", date: on(2026, 8, 5) }),
  makeTx({ id: "w1x", type: "savings_withdrawal", amount: 50_000, destinationWalletId: "w1", savingsTargetId: "s1", date: on(2026, 8, 6) }),
  makeTx({ id: "o1", type: "opening_balance", amount: 5_000_000, destinationWalletId: "w1", date: on(2026, 1, 1) }),
  makeTx({ id: "i1", type: "income", amount: 500_000, destinationWalletId: "w1", categoryId: "gaji", date: on(2026, 8, 1) }),
];

describe("month keys & labels", () => {
  it("derives YYYY-MM from a calendar date", () => {
    expect(monthKeyOf(on(2026, 8, 31))).toBe("2026-08");
    expect(monthKeyOf(on(2026, 1, 1))).toBe("2026-01");
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-08", -5)).toBe("2026-03");
  });

  it("formats an Indonesian month label", () => {
    expect(formatMonthLabel("2026-08")).toMatch(/2026/);
    expect(formatMonthLabel("2026-08")).toMatch(/Agustus|August/i);
  });

  it("currentMonthKey follows the injected clock in the Asia/Jakarta reference calendar", () => {
    expect(currentMonthKey(new Date(at(2026, 8, 15)))).toBe("2026-08");
    // 2026-08-31T18:00Z is already 2026-09-01 in Jakarta (UTC+7).
    expect(currentMonthKey(new Date(at(2026, 8, 31, 18)))).toBe("2026-09");
  });
});

describe("calculateMonthlySummary", () => {
  it("counts only income and expense", () => {
    const summary = calculateMonthlySummary(budgetOnlyLedger, "2026-08");
    expect(summary.income).toBe(500_000);
    expect(summary.expense).toBe(100_000);
    expect(summary.netCashFlow).toBe(400_000);
    expect(summary.incomeCount).toBe(1);
    expect(summary.expenseCount).toBe(1);
  });

  it("excludes the opening balance of January from August", () => {
    expect(calculateMonthlySummary(budgetOnlyLedger, "2026-01").income).toBe(0);
    expect(calculateMonthlySummary(budgetOnlyLedger, "2026-01").netCashFlow).toBe(0);
  });

  it("returns zeros for a month without records", () => {
    expect(calculateMonthlySummary(budgetOnlyLedger, "2026-05")).toMatchObject({
      income: 0,
      expense: 0,
      netCashFlow: 0,
    });
  });
});

describe("calculateMonthlyTrend", () => {
  it("produces one point per requested month, in order", () => {
    const trend = calculateMonthlyTrend(budgetOnlyLedger, ["2026-06", "2026-07", "2026-08"]);
    expect(trend.map((point) => point.monthKey)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(trend[0]).toMatchObject({ income: 0, expense: 0, netCashFlow: 0 });
    expect(trend[2]).toMatchObject({ income: 500_000, expense: 100_000, netCashFlow: 400_000 });
  });
});

describe("category aggregation", () => {
  it("splits the breakdown by type and month, with percentages", () => {
    const breakdown = calculateCategoryBreakdown(budgetOnlyLedger, { type: "expense", monthKey: "2026-08" });
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({ categoryId: "makanan", amount: 100_000, count: 1, percent: 100 });

    const incomeBreakdown = calculateCategoryBreakdown(budgetOnlyLedger, { type: "income", monthKey: "2026-08" });
    expect(incomeBreakdown[0]?.categoryId).toBe("gaji");
  });

  it("excludes internal movements entirely", () => {
    const all = calculateCategoryBreakdown(budgetOnlyLedger, { type: "expense", monthKey: null });
    expect(all.reduce((sum, entry) => sum + entry.amount, 0)).toBe(100_000);
  });

  it("groups records without a category under null", () => {
    const ledger = [
      makeTx({ id: "x", type: "expense", amount: 5_000, sourceWalletId: "w1", date: on(2026, 8, 1) }),
      makeTx({ id: "y", type: "expense", amount: 15_000, sourceWalletId: "w1", categoryId: "makanan", date: on(2026, 8, 2) }),
    ];
    const breakdown = calculateCategoryBreakdown(ledger, { type: "expense" });
    expect(breakdown.map((entry) => entry.categoryId)).toEqual(["makanan", null]);
    expect(breakdown[0]?.percent).toBeCloseTo(75, 6);
    expect(breakdown[1]?.percent).toBeCloseTo(25, 6);
  });

  it("calculateCategorySpend counts real expenses only (spec §52)", () => {
    expect(calculateCategorySpend(budgetOnlyLedger, "makanan", "2026-08")).toBe(100_000);
    expect(calculateCategoryTotalsForMonth(budgetOnlyLedger, "2026-08").get("makanan")).toBe(100_000);
  });
});

describe("budget usage", () => {
  it("measures spend against the limit, ignoring transfers and deposits", () => {
    const budget = makeBudget("makanan", "2026-08", 1_000_000);
    const usage = calculateBudgetUsage(budget, budgetOnlyLedger, "2026-08");
    expect(usage.spent).toBe(100_000);
    expect(usage.limit).toBe(1_000_000);
    expect(usage.remaining).toBe(900_000);
    expect(usage.percent).toBeCloseTo(10, 6);
    expect(usage.overBudget).toBe(false);
  });

  it("allows blowing past the limit (negative remaining, >100%)", () => {
    const budget = makeBudget("makanan", "2026-08", 50_000);
    const usage = calculateBudgetUsage(budget, budgetOnlyLedger, "2026-08");
    expect(usage.remaining).toBe(-50_000);
    expect(usage.percent).toBeCloseTo(200, 6);
    expect(usage.overBudget).toBe(true);
  });

  it("lists only the requested month, worst first", () => {
    const budgets = [
      makeBudget("transportasi", "2026-08", 100_000, { id: "b1" }),
      makeBudget("makanan", "2026-08", 110_000, { id: "b2" }),
      makeBudget("makanan", "2026-07", 10_000, { id: "b3" }),
    ];
    const list = calculateBudgetUsageList(budgets, budgetOnlyLedger, "2026-08");
    expect(list.map((usage) => usage.budget.id)).toEqual(["b2", "b1"]);
    expect(list[0]?.percent).toBeCloseTo(100 / 110 * 100, 4);
  });

  it("treats a zero limit as 0% when nothing was spent", () => {
    const usage = calculateBudgetUsage(makeBudget("makanan", "2026-01", 0), budgetOnlyLedger, "2026-01");
    expect(usage.percent).toBe(0);
    expect(usage.overBudget).toBe(false);
  });
});

describe("savings progress", () => {
  it("caps the bar at 100 while keeping the real percentage", () => {
    const ledger = [
      makeTx({ id: "d", type: "savings_deposit", amount: 15_000_000, sourceWalletId: "w1", savingsTargetId: "s1", date: on(2026, 8, 1) }),
    ];
    const progress = calculateSavingsProgress(makeTarget("s1", 10_000_000), ledger);
    expect(progress.saved).toBe(15_000_000);
    expect(progress.percentActual).toBeCloseTo(150, 6);
    expect(progress.percentCapped).toBe(100);
    expect(progress.remaining).toBe(0);
    expect(progress.goalReached).toBe(true);
  });

  it("never reports a negative remainder", () => {
    const progress = calculateSavingsProgress(makeTarget("s1", 1_000_000), []);
    expect(progress.saved).toBe(0);
    expect(progress.remaining).toBe(1_000_000);
    expect(progress.percentCapped).toBe(0);
  });
});

describe("buildWalletRows", () => {
  it("includes archived wallets and counts every record that touches them", () => {
    const wallets = [makeWallet("w1"), makeWallet("w2", { archivedAt: at(2026, 7, 1) })];
    const rows = buildWalletRows(wallets, budgetOnlyLedger);
    expect(rows.map((row) => row.wallet.id)).toEqual(["w1", "w2"]);
    expect(rows[0]?.balance).toBe(5_000_000 + 500_000 - 100_000 - 200_000 - 300_000 + 50_000);
    expect(rows[0]?.transactionCount).toBe(6);
    expect(rows[1]?.balance).toBe(200_000);
    expect(rows[1]?.transactionCount).toBe(1);
  });

  it("handles an empty dataset", () => {
    expect(buildWalletRows([], [])).toEqual([]);
  });
});

describe("period helpers & filters", () => {
  it("rangeForPeriod returns inclusive YYYY-MM-DD calendar bounds", () => {
    const now = new Date(at(2026, 8, 15, 5)); // 12:00 in Jakarta on 15 August 2026
    expect(rangeForPeriod("thisMonth", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeForPeriod("lastMonth", now)).toEqual({ from: "2026-07-01", to: "2026-07-31" });

    const custom = rangeForPeriod({ from: "2026-08-03", to: "2026-08-04" }, now);
    expect(custom).toEqual({ from: "2026-08-03", to: "2026-08-04" });
    expect(inPeriod(on(2026, 8, 3), custom)).toBe(true);
    expect(inPeriod(on(2026, 8, 2), custom)).toBe(false);
  });

  it("filterTransactions combines every facet", () => {
    const ledger = budgetOnlyLedger;
    expect(filterTransactions(ledger, {})).toHaveLength(ledger.length);
    expect(filterTransactions(ledger, { types: ["expense"] }).map((t) => t.id)).toEqual(["e1"]);
    expect(filterTransactions(ledger, { categoryIds: ["makanan"] }).map((t) => t.id)).toEqual(["e1"]);
    expect(filterTransactions(ledger, { walletIds: ["w2"] }).map((t) => t.id)).toEqual(["t1"]);
    expect(filterTransactions(ledger, { paymentMethods: ["qris"] })).toHaveLength(0);
    expect(filterTransactions(ledger, { from: "2026-08-04", to: "2026-08-06" }).map((t) => t.id)).toEqual([
      "t1",
      "d1",
      "w1x",
    ]);
  });

  it("searches notes, category labels and wallet names", () => {
    const ledger = [
      makeTx({ id: "a", type: "expense", amount: 12_000, sourceWalletId: "w1", categoryId: "makanan", note: "makan siang di kantin", date: on(2026, 8, 1) }),
      makeTx({ id: "b", type: "expense", amount: 3_000, sourceWalletId: "w1", categoryId: "transportasi", note: null, date: on(2026, 8, 2) }),
    ];
    const options = {
      walletNames: new Map([["w1", "Dompet Utama"]]),
      categoryLabels: new Map([["makanan", "Makanan"], ["transportasi", "Transportasi"]]),
    };
    expect(filterTransactions(ledger, { query: "kantin" }, options).map((t) => t.id)).toEqual(["a"]);
    expect(filterTransactions(ledger, { query: "transportasi" }, options).map((t) => t.id)).toEqual(["b"]);
    expect(filterTransactions(ledger, { query: "dompet utama" }, options).map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTransactions(ledger, { query: "  MAKAN  " }, options).map((t) => t.id)).toEqual(["a"]);
    expect(filterTransactions(ledger, { query: "zzz" }, options)).toEqual([]);
  });

  it("returns results in the deterministic ledger order, newest day last", () => {
    const ledger = [
      makeTx({ id: "z", type: "expense", amount: 1, sourceWalletId: "w1", categoryId: "makanan", date: on(2026, 8, 9) }),
      makeTx({ id: "y", type: "expense", amount: 1, sourceWalletId: "w1", categoryId: "makanan", date: on(2026, 8, 1) }),
    ];
    expect(filterTransactions(ledger, {}).map((t) => t.id)).toEqual(["y", "z"]);
  });
});

describe("findDuplicateBudgetKeys", () => {
  it("detects two budgets for the same category and month", () => {
    const budgets = [
      makeBudget("makanan", "2026-08", 1, { id: "a" }),
      makeBudget("makanan", "2026-08", 2, { id: "b" }),
      makeBudget("makanan", "2026-09", 2, { id: "c" }),
    ];
    expect(findDuplicateBudgetKeys(budgets)).toEqual(["makanan::2026-08"]);
    expect(findDuplicateBudgetKeys(budgets.slice(2))).toEqual([]);
  });
});

describe("empty dataset behaviour (spec §33 — functional empty states)", () => {
  it("every selector returns zeros instead of throwing", () => {
    const data = emptyData();
    expect(calculateMonthlySummary(data.transactions, "2026-08")).toMatchObject({ income: 0, expense: 0, netCashFlow: 0 });
    expect(calculateCategoryBreakdown(data.transactions, { type: "expense" })).toEqual([]);
    expect(calculateBudgetUsageList(data.budgets, data.transactions, "2026-08")).toEqual([]);
    expect(buildWalletRows(data.wallets, data.transactions)).toEqual([]);
    expect(filterTransactions(data.transactions, { query: "x" })).toEqual([]);
  });
});
