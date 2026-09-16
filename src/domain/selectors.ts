import type { TransactionType } from "@/domain/categories";
import { budgetKey, type Budget, type Transaction, type Wallet, type SavingsTarget } from "@/domain/models";
import { calculateSavingsBalance, calculateWalletBalance, sortTransactions, type Ledger } from "@/domain/ledger";
import { daysInMonth, getMonthKey, getTodayCalendarDate, isMonthKey, parseCalendarDate } from "@/domain/calendar";

/**
 * SmartSpend — reporting selectors.
 *
 * Pure aggregation on top of the ledger. The UI must never do arithmetic; every
 * number on every screen comes from one of these functions.
 *
 * Financial month keys are calendar strings. Only clock defaults use the
 * centralized product reference timezone.
 */

/** Reference-calendar month for an actual clock instant. */
export function monthKeyFromDate(date: Date): string {
  return getMonthKey(getTodayCalendarDate(date));
}

/** "YYYY-MM" for an ISO timestamp, in local time. */
export function monthKeyOf(calendarDate: string): string {
  return getMonthKey(calendarDate);
}

export function currentMonthKey(now: Date = new Date()): string {
  return monthKeyFromDate(now);
}

export function shiftMonthKey(key: string, delta: number): string {
  if (!isMonthKey(key) || !Number.isInteger(delta)) throw new RangeError("Invalid month");
  const [yearRaw, monthRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const index = year * 12 + month - 1 + delta;
  const result = `${Math.floor(index / 12)}`.padStart(4, "0") + `-${((index % 12 + 12) % 12 + 1).toString().padStart(2, "0")}`;
  if (!isMonthKey(result)) throw new RangeError("Month out of range");
  return result;
}

export function formatMonthLabel(key: string, locale = "id-ID"): string {
  if (!isMonthKey(key)) return "—";
  const date = new Date(`${key}-01T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Inclusive calendar bounds. No instants or timezone conversions. */
export function rangeForPeriod(
  period: "thisMonth" | "lastMonth" | { from: string; to: string },
  now: Date = new Date(),
): { from: string; to: string } {
  if (period !== "thisMonth" && period !== "lastMonth") {
    if (!parseCalendarDate(period.from) || !parseCalendarDate(period.to)) throw new RangeError("Invalid calendar range");
    return { from: period.from, to: period.to };
  }
  const month = shiftMonthKey(currentMonthKey(now), period === "lastMonth" ? -1 : 0);
  const [year, monthNumber] = month.split("-").map(Number);
  if (year === undefined || monthNumber === undefined) throw new RangeError("Invalid month");
  return { from: `${month}-01`, to: `${month}-${daysInMonth(year, monthNumber)}` };
}

export function inPeriod(date: string, range: { from: string; to: string }): boolean {
  return parseCalendarDate(date) !== null && date >= range.from && date <= range.to;
}

/* -------------------------------------------------------------------------- */
/* Monthly summary                                                             */
/* -------------------------------------------------------------------------- */

export interface MonthlySummary {
  monthKey: string;
  /** Only `type === "income"`. */
  income: number;
  /** Only `type === "expense"`. */
  expense: number;
  incomeCount: number;
  expenseCount: number;
  /** income - expense. Transfers / savings movements / opening balance excluded. */
  netCashFlow: number;
}

export function calculateMonthlySummary(ledger: Ledger, monthKey: string): MonthlySummary {
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const transaction of ledger) {
    if (monthKeyOf(transaction.date) !== monthKey) continue;
    if (transaction.type === "income") {
      income += transaction.amount;
      incomeCount += 1;
    } else if (transaction.type === "expense") {
      expense += transaction.amount;
      expenseCount += 1;
    }
    // transfer / savings_deposit / savings_withdrawal / opening_balance: excluded on purpose.
  }

  return {
    monthKey,
    income,
    expense,
    incomeCount,
    expenseCount,
    netCashFlow: income - expense,
  };
}

export interface MonthPoint {
  monthKey: string;
  income: number;
  expense: number;
  netCashFlow: number;
}

export function calculateMonthlyTrend(ledger: Ledger, monthKeys: readonly string[]): MonthPoint[] {
  return monthKeys.map((key) => {
    const summary = calculateMonthlySummary(ledger, key);
    return {
      monthKey: key,
      income: summary.income,
      expense: summary.expense,
      netCashFlow: summary.netCashFlow,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Category breakdown                                                          */
/* -------------------------------------------------------------------------- */

export interface CategoryBreakdownEntry {
  categoryId: string | null;
  amount: number;
  count: number;
  /** Share of the total, 0..100. */
  percent: number;
}

/**
 * Spending (or earning) grouped by category. `type` selects which side of the
 * ledger to aggregate; internal movements are never part of a breakdown.
 */
export function calculateCategoryBreakdown(
  ledger: Ledger,
  options: { type: "income" | "expense"; monthKey?: string | null } = { type: "expense", monthKey: null },
): CategoryBreakdownEntry[] {
  const totals = new Map<string | null, { amount: number; count: number }>();

  for (const transaction of ledger) {
    if (transaction.type !== options.type) continue;
    if (options.monthKey && monthKeyOf(transaction.date) !== options.monthKey) continue;
    const key = transaction.categoryId ?? null;
    const entry = totals.get(key) ?? { amount: 0, count: 0 };
    entry.amount += transaction.amount;
    entry.count += 1;
    totals.set(key, entry);
  }

  const grandTotal = [...totals.values()].reduce((sum, entry) => sum + entry.amount, 0);

  return [...totals.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      amount: entry.amount,
      count: entry.count,
      percent: grandTotal > 0 ? (entry.amount / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || String(a.categoryId).localeCompare(String(b.categoryId)));
}

/** All spend in one category for a month — the number budgets are measured against. */
export function calculateCategorySpend(ledger: Ledger, categoryId: string, monthKey: string): number {
  let total = 0;
  for (const transaction of ledger) {
    if (transaction.type !== "expense") continue;
    if (transaction.categoryId !== categoryId) continue;
    if (monthKeyOf(transaction.date) !== monthKey) continue;
    total += transaction.amount;
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                     */
/* -------------------------------------------------------------------------- */

export interface BudgetUsage {
  budget: Budget;
  /** REAL expenses only — transfers, deposits, withdrawals and opening balances are excluded. */
  spent: number;
  limit: number;
  /** limit - spent; can be negative when the budget is blown. */
  remaining: number;
  /** 0..100+, capped at display level, not here. */
  percent: number;
  overBudget: boolean;
}

export function calculateBudgetUsage(budget: Budget, ledger: Ledger, monthKey: string): BudgetUsage {
  const spent = calculateCategorySpend(ledger, budget.categoryId, monthKey);
  const limit = budget.limitAmount;
  return {
    budget,
    spent,
    limit,
    remaining: limit - spent,
    percent: limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0,
    overBudget: spent > limit,
  };
}

export function calculateBudgetUsageList(
  budgets: readonly Budget[],
  ledger: Ledger,
  monthKey: string,
): BudgetUsage[] {
  return budgets
    .filter((budget) => budget.month === monthKey)
    .map((budget) => calculateBudgetUsage(budget, ledger, monthKey))
    .sort((a, b) => b.percent - a.percent || a.budget.categoryId.localeCompare(b.budget.categoryId));
}

/** Per-category totals for a month (used by the budget overview "unbudgeted" line). */
export function calculateCategoryTotalsForMonth(
  ledger: Ledger,
  monthKey: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of ledger) {
    if (transaction.type !== "expense") continue;
    if (monthKeyOf(transaction.date) !== monthKey) continue;
    const key = transaction.categoryId;
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }
  return totals;
}

/* -------------------------------------------------------------------------- */
/* Savings progress                                                            */
/* -------------------------------------------------------------------------- */

export interface SavingsProgress {
  target: SavingsTarget;
  saved: number;
  targetAmount: number;
  /** Capped at 100 for the progress bar. */
  percentCapped: number;
  /** Uncapped, may exceed 100 — saving more than the goal is allowed. */
  percentActual: number;
  remaining: number;
  goalReached: boolean;
}

export function calculateSavingsProgress(
  target: SavingsTarget,
  ledger: Ledger,
): SavingsProgress {
  const saved = calculateSavingsBalance(ledger, target.id);
  const targetAmount = target.targetAmount;
  const percentActual = targetAmount > 0 ? (saved / targetAmount) * 100 : saved > 0 ? 100 : 0;
  return {
    target,
    saved,
    targetAmount,
    percentCapped: Math.min(100, Math.max(0, percentActual)),
    percentActual,
    remaining: Math.max(0, targetAmount - saved),
    goalReached: saved >= targetAmount,
  };
}

/* -------------------------------------------------------------------------- */
/* Wallet overview rows                                                        */
/* -------------------------------------------------------------------------- */

export interface WalletRow {
  wallet: Wallet;
  balance: number;
  transactionCount: number;
}

export function buildWalletRows(wallets: readonly Wallet[], ledger: Ledger): WalletRow[] {
  const counts = new Map<string, number>();
  for (const transaction of ledger) {
    for (const id of [transaction.sourceWalletId, transaction.destinationWalletId]) {
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return wallets.map((wallet) => ({
    wallet,
    balance: calculateWalletBalance(ledger, wallet.id),
    transactionCount: counts.get(wallet.id) ?? 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Search & filter                                                             */
/* -------------------------------------------------------------------------- */

export interface TransactionFilter {
  query?: string;
  types?: readonly TransactionType[];
  categoryIds?: readonly string[];
  walletIds?: readonly string[];
  paymentMethods?: readonly string[];
  /** Inclusive calendar range. */
  from?: string;
  to?: string;
}

export function filterTransactions(
  ledger: Ledger,
  filter: TransactionFilter,
  options: { walletNames?: Map<string, string>; categoryLabels?: Map<string, string> } = {},
): Transaction[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  const types = filter.types?.length ? new Set(filter.types) : undefined;
  const categories = filter.categoryIds?.length ? new Set(filter.categoryIds) : undefined;
  const wallets = filter.walletIds?.length ? new Set(filter.walletIds) : undefined;
  const methods = filter.paymentMethods?.length ? new Set(filter.paymentMethods) : undefined;
  const fromDate = filter.from || undefined;
  const toDate = filter.to || undefined;

  const sorted = sortTransactions(ledger);
  if (!query && !types && !categories && !wallets && !methods && fromDate === undefined && toDate === undefined) {
    return sorted;
  }

  return sorted.filter((transaction) => {
    if (types && !types.has(transaction.type)) return false;
    if (categories && !(transaction.categoryId && categories.has(transaction.categoryId))) return false;
    if (methods && !(transaction.paymentMethod && methods.has(transaction.paymentMethod))) return false;
    if (wallets) {
      const touched = [transaction.sourceWalletId, transaction.destinationWalletId].some(
        (id) => id !== null && id !== undefined && wallets.has(id),
      );
      if (!touched) return false;
    }
    if (fromDate !== undefined && transaction.date < fromDate) return false;
    if (toDate !== undefined && transaction.date > toDate) return false;

    if (query) {
      // Search covers note, category label and the wallet names involved.
      const haystack: string[] = [transaction.note ?? ""];
      if (transaction.categoryId) {
        haystack.push(
          transaction.categoryId,
          options.categoryLabels?.get(transaction.categoryId) ?? transaction.categoryId,
        );
      }
      for (const id of [transaction.sourceWalletId, transaction.destinationWalletId]) {
        if (id) haystack.push(options.walletNames?.get(id) ?? id);
      }
      haystack.push(String(transaction.amount));
      const matches = haystack.some((part) => part.toLowerCase().includes(query));
      if (!matches) return false;
    }
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Duplicate detection (used by import)                                        */
/* -------------------------------------------------------------------------- */

export function findDuplicateBudgetKeys(budgets: readonly Budget[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const budget of budgets) {
    const key = budgetKey(budget);
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  return duplicates;
}
