"use client";

import { formatIDR } from "@/domain/money";
import { useSmartSpendStore } from "@/app/store";

/**
 * SmartSpend — balance-hiding utilities.
 *
 * The `hideBalances` preference lives in `appSettings` and is persisted
 * immediately. When enabled, high-level monetary surfaces replace the numeric
 * value with a fixed mask ("Rp••••") so shoulder-surfing can't reveal a figure.
 *
 * IMPORTANT: this never touches stored financial values — it is purely a
 * presentation transform applied at render time.
 */

const MASK = "Rp\u2022\u2022\u2022\u2022";

/** Fixed-width mask string used in place of a formatted monetary value. */
export function maskMoney(): string {
  return MASK;
}

/** Format money normally, or return a fixed mask when balances are hidden. */
export function formatMoney(amount: number): string {
  const hidden = useSmartSpendStore.getState().data.settings?.hideBalances ?? false;
  return hidden ? MASK : formatIDR(amount);
}

/**
 * React hook variant — re-renders when the preference changes so components
 * can display the right state without polling the store directly.
 */
export function useMoneyFormatter(): (amount: number) => string {
  const hideBalances = useSmartSpendStore((state) => state.data.settings?.hideBalances ?? false);
  return (amount: number) => (hideBalances ? MASK : formatIDR(amount));
}

/** Read the raw preference (true = balances are hidden). */
export function useHideBalances(): boolean {
  return useSmartSpendStore((state) => state.data.settings?.hideBalances ?? false) === true;
}
