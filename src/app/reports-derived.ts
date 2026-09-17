"use client";

import { monthKeyOf, shiftMonthKey } from "@/domain/selectors";
import type { Ledger } from "@/domain/ledger";
import type { Budget } from "@/domain/models";
import {
  calculateMonthlySummary,
  calculateCategoryBreakdown,
  calculateBudgetUsageList,
  type MonthlySummary,
  type CategoryBreakdownEntry,
  type BudgetUsage,
} from "@/domain/selectors";
import { isMonthKey } from "@/domain/calendar";

/**
 * Reports — pure read-only derivation helpers.
 * All aggregation uses transaction.date via monthKeyOf, never createdAt.
 * No mutable state, no second financial system.
 */

export interface MoneyFlow {
  monthKey: string;
  income: number;
  expense: number;
  transfer: number;
  savingsDeposit: number;
  savingsWithdrawal: number;
  netCashFlow: number; // income - expense, excludes internal movement
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  savingsDepositCount: number;
  savingsWithdrawalCount: number;
}

export function calculateMoneyFlow(ledger: Ledger, monthKey: string): MoneyFlow {
  let income = 0;
  let expense = 0;
  let transfer = 0;
  let savingsDeposit = 0;
  let savingsWithdrawal = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let transferCount = 0;
  let savingsDepositCount = 0;
  let savingsWithdrawalCount = 0;

  for (const tx of ledger) {
    if (monthKeyOf(tx.date) !== monthKey) continue;
    switch (tx.type) {
      case "income":
        income += tx.amount;
        incomeCount += 1;
        break;
      case "expense":
        expense += tx.amount;
        expenseCount += 1;
        break;
      case "transfer":
        transfer += tx.amount;
        transferCount += 1;
        break;
      case "savings_deposit":
        savingsDeposit += tx.amount;
        savingsDepositCount += 1;
        break;
      case "savings_withdrawal":
        savingsWithdrawal += tx.amount;
        savingsWithdrawalCount += 1;
        break;
      case "opening_balance":
        // excluded from monthly activity
        break;
    }
  }

  return {
    monthKey,
    income,
    expense,
    transfer,
    savingsDeposit,
    savingsWithdrawal,
    netCashFlow: income - expense,
    incomeCount,
    expenseCount,
    transferCount,
    savingsDepositCount,
    savingsWithdrawalCount,
  };
}

export function getLast6MonthKeys(endMonthKey: string): string[] {
  if (!isMonthKey(endMonthKey)) throw new RangeError("Invalid month key");
  const keys: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    keys.push(shiftMonthKey(endMonthKey, -i));
  }
  return keys;
}

export type TrendPoint = MonthlySummary;

export function calculateTrend(ledger: Ledger, endMonthKey: string): TrendPoint[] {
  const keys = getLast6MonthKeys(endMonthKey);
  return keys.map((key) => calculateMonthlySummary(ledger, key));
}

export interface ReportModel {
  monthKey: string;
  monthly: MonthlySummary;
  moneyFlow: MoneyFlow;
  expenseByCategory: CategoryBreakdownEntry[];
  incomeByCategory: CategoryBreakdownEntry[];
  budgetUsages: BudgetUsage[];
  trend: TrendPoint[];
  hasAnyActivity: boolean;
  hasExpense: boolean;
  hasIncome: boolean;
  hasBudgets: boolean;
}

export function buildReportModel(ledger: Ledger, budgets: readonly Budget[], monthKey: string): ReportModel {
  const monthly = calculateMonthlySummary(ledger, monthKey);
  const moneyFlow = calculateMoneyFlow(ledger, monthKey);
  const expenseByCategory = calculateCategoryBreakdown(ledger, { type: "expense", monthKey });
  const incomeByCategory = calculateCategoryBreakdown(ledger, { type: "income", monthKey });
  const budgetUsages = calculateBudgetUsageList(budgets, ledger, monthKey);
  const trend = calculateTrend(ledger, monthKey);

  const hasAnyActivity =
    moneyFlow.incomeCount +
      moneyFlow.expenseCount +
      moneyFlow.transferCount +
      moneyFlow.savingsDepositCount +
      moneyFlow.savingsWithdrawalCount >
    0;

  return {
    monthKey,
    monthly,
    moneyFlow,
    expenseByCategory,
    incomeByCategory,
    budgetUsages,
    trend,
    hasAnyActivity,
    hasExpense: monthly.expenseCount > 0,
    hasIncome: monthly.incomeCount > 0,
    hasBudgets: budgetUsages.length > 0,
  };
}

/**
 * Compact IDR for chart labels on mobile.
 * Examples: 500 -> Rp500, 500_000 -> Rp500rb, 1_200_000 -> Rp1,2jt, 1_000_000_000 -> Rp1M
 * Full exact values remain available elsewhere.
 */
export function formatCompactIDR(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "Rp0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs < 1000) return `${sign}Rp${abs}`;
  if (abs < 1_000_000) {
    const rb = abs / 1000;
    // 500_000 -> 500rb, 550_000 -> 550rb, 1_200 -> 1,2rb? Keep simple: show without decimal if integer, else one decimal
    if (rb % 1 === 0) return `${sign}Rp${rb}rb`;
    return `${sign}Rp${rb.toFixed(1).replace(".", ",")}rb`;
  }
  if (abs < 1_000_000_000) {
    const jt = abs / 1_000_000;
    if (jt % 1 === 0) return `${sign}Rp${jt}jt`;
    // one decimal, id locale uses comma
    return `${sign}Rp${jt.toFixed(1).replace(".", ",")}jt`;
  }
  const m = abs / 1_000_000_000;
  if (m % 1 === 0) return `${sign}Rp${m}M`;
  return `${sign}Rp${m.toFixed(1).replace(".", ",")}M`;
}
