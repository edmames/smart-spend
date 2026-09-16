"use client";

import { useMemo } from "react";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/domain/models";
import { ALL_CATEGORIES, categoriesForType } from "@/domain/categories";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateWalletBalance } from "@/domain/ledger";

/**
 * SmartSpend — option lists for forms and filters.
 *
 * Every picker is built from the store, so archived wallets disappear from
 * "new transaction" lists but remain visible (and correctly labelled) on
 * historical records.
 */

export interface Option {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function useWalletOptions(options: { includeArchived?: boolean; withBalance?: boolean } = {}): Option[] {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => {
    const { includeArchived = false, withBalance = true } = options;
    return data.wallets
      .filter((wallet) => (includeArchived ? true : wallet.archivedAt == null))
      .map((wallet) => ({
        value: wallet.id,
        label: withBalance ? wallet.name : wallet.name,
        hint: withBalance ? formatIDR(calculateWalletBalance(data.transactions, wallet.id)) : undefined,
        disabled: wallet.archivedAt != null,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.wallets, data.transactions, options.includeArchived, options.withBalance]);
}

/** Wallet options rendered as "BCA · Rp1.200.000" — a single string keeps <select> honest on mobile. */
export function useWalletSelectOptions(options: { includeArchived?: boolean } = {}): Option[] {
  const data = useSmartSpendStore((state) => state.data);
  const includeArchived = options.includeArchived ?? false;
  return useMemo(
    () =>
      data.wallets
        .filter((wallet) => (includeArchived ? true : wallet.archivedAt == null))
        .map((wallet) => {
          const balance = calculateWalletBalance(data.transactions, wallet.id);
          return {
            value: wallet.id,
            label: `${wallet.name} · ${formatIDR(balance)}${wallet.archivedAt ? " (arsip)" : ""}`,
          };
        }),
    [data.wallets, data.transactions, includeArchived],
  );
}

export function useSavingsOptions(options: { includeArchived?: boolean } = {}): Option[] {
  const data = useSmartSpendStore((state) => state.data);
  const includeArchived = options.includeArchived ?? false;
  return useMemo(
    () =>
      data.savingsTargets
        .filter((target) => (includeArchived ? true : target.archivedAt == null))
        .map((target) => ({ value: target.id, label: target.name })),
    [data.savingsTargets, includeArchived],
  );
}

export function useCategoryOptions(kind: "income" | "expense"): Option[] {
  return useMemo(
    () => categoriesForType(kind).map((category) => ({ value: category.id, label: category.label })),
    [kind],
  );
}

export const ALL_CATEGORY_OPTIONS: Option[] = ALL_CATEGORIES.map((category) => ({
  value: category.id,
  label: `${category.label} (${category.type === "income" ? "masuk" : "keluar"})`,
}));

export const PAYMENT_METHOD_OPTIONS: Option[] = PAYMENT_METHODS.map((method: PaymentMethod) => ({
  value: method,
  label: PAYMENT_METHOD_LABELS[method],
}));
