"use client";

import { useMemo } from "react";
import { useSmartSpendStore } from "@/app/store";
import { calculateSavingsBalance, calculateTotalMoney, calculateWalletBalance, sortTransactions } from "@/domain/ledger";
import {
  buildWalletRows,
  calculateSavingsProgress,
  calculateBudgetUsageList,
  calculateCategoryBreakdown,
  calculateMonthlySummary,
  currentMonthKey,
  type BudgetUsage,
  type CategoryBreakdownEntry,
  type MonthlySummary,
  type WalletRow,
} from "@/domain/selectors";
import type { SavingsTarget, Transaction, Wallet } from "@/domain/models";
import type { SavingsProgress } from "@/domain/selectors";
import type { AppData } from "@/app/actions";

/**
 * SmartSpend — derived state hooks.
 *
 * Every number rendered on screen comes from here (and therefore from the pure
 * domain functions). Components never add up amounts themselves, and nothing
 * derived is ever stored in the Zustand dataset — that is what keeps persistence
 * free of duplicate/stale balance state.
 */

export interface DerivedData {
  data: AppData;
  /** All wallets, active first, then archived — each with its derived balance. */
  walletRows: WalletRow[];
  activeWallets: Wallet[];
  archivedWallets: Wallet[];
  activeSavingsTargets: SavingsTarget[];
  archivedSavingsTargets: SavingsTarget[];
  savingsProgress: SavingsProgress[];
  savingsById: Map<string, number>;
  walletBalanceById: Map<string, number>;
  totalMoney: { walletTotal: number; savingsTotal: number; total: number };
  monthly: MonthlySummary;
  monthKey: string;
  budgetUsages: BudgetUsage[];
  expenseBreakdown: CategoryBreakdownEntry[];
  incomeBreakdown: CategoryBreakdownEntry[];
  /** Ledger sorted by the deterministic ordering rule, newest first for display. */
  transactionsDesc: Transaction[];
  walletNameById: Map<string, string>;
  savingsNameById: Map<string, string>;
  isEmpty: boolean;
  counts: { wallets: number; transactions: number; savings: number; budgets: number };
}

export function useWalletBalance(walletId: string | null | undefined): number {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => (walletId ? calculateWalletBalance(data.transactions, walletId) : 0), [data.transactions, walletId]);
}

export function useSavingsBalance(targetId: string | null | undefined): number {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => (targetId ? calculateSavingsBalance(data.transactions, targetId) : 0), [data.transactions, targetId]);
}

export function buildDerived(data: AppData, monthKey: string = currentMonthKey()): Omit<DerivedData, "data"> {
  const { wallets, savingsTargets, transactions, budgets } = data;

  const walletRows = buildWalletRows(wallets, transactions);
  const activeWallets = wallets.filter((wallet) => wallet.archivedAt == null);
  const archivedWallets = wallets.filter((wallet) => wallet.archivedAt != null);

  const savingsProgress = savingsTargets.map((target) => calculateSavingsProgress(target, transactions));

  return {
    walletRows,
    activeWallets,
    archivedWallets,
    activeSavingsTargets: savingsTargets.filter((target) => target.archivedAt == null),
    archivedSavingsTargets: savingsTargets.filter((target) => target.archivedAt != null),
    savingsProgress,
    savingsById: new Map(savingsTargets.map((target) => [target.id, calculateSavingsBalance(transactions, target.id)])),
    walletBalanceById: new Map(wallets.map((wallet) => [wallet.id, calculateWalletBalance(transactions, wallet.id)])),
    totalMoney: calculateTotalMoney(wallets, savingsTargets, transactions),
    monthly: calculateMonthlySummary(transactions, monthKey),
    monthKey,
    budgetUsages: calculateBudgetUsageList(budgets, transactions, monthKey),
    expenseBreakdown: calculateCategoryBreakdown(transactions, { type: "expense", monthKey }),
    incomeBreakdown: calculateCategoryBreakdown(transactions, { type: "income", monthKey }),
    transactionsDesc: sortTransactions(transactions).reverse(),
    walletNameById: new Map(wallets.map((wallet) => [wallet.id, wallet.name])),
    savingsNameById: new Map(savingsTargets.map((target) => [target.id, target.name])),
    isEmpty: wallets.length === 0 && transactions.length === 0 && savingsTargets.length === 0 && budgets.length === 0,
    counts: {
      wallets: wallets.length,
      transactions: transactions.length,
      savings: savingsTargets.length,
      budgets: budgets.length,
    },
  };
}

export function useDerived(monthKey: string = currentMonthKey()): DerivedData {
  const data = useSmartSpendStore((state) => state.data);
  const derived = useMemo(() => buildDerived(data, monthKey), [data, monthKey]);
  return { data, ...derived };
}

export function useHydrated(): boolean {
  return useSmartSpendStore((state) => state.hydration) === "ready";
}

export function useTransactionById(id: string | undefined): Transaction | undefined {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => data.transactions.find((transaction) => transaction.id === id), [data.transactions, id]);
}

export function useWalletById(id: string | undefined): Wallet | undefined {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => data.wallets.find((wallet) => wallet.id === id), [data.wallets, id]);
}

export function useSavingsTargetById(id: string | undefined): SavingsTarget | undefined {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => data.savingsTargets.find((target) => target.id === id), [data.savingsTargets, id]);
}
