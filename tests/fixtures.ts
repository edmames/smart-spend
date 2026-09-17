import type { Budget, SavingsTarget, Transaction, Wallet } from "@/domain/models";
import { seedDefaultCategories } from "@/repository/storage-schema";
import type { PersistedData } from "@/repository/storage-schema";
import { DEFAULT_SETTINGS } from "@/domain/models";

/**
 * Shared builders for the financial suites.
 *
 * Timestamps are fixed so every test is deterministic (spec §23 requires a
 * reproducible chronological order, which is impossible with `new Date()`).
 */

export const EPOCH = "2026-01-01T00:00:00.000Z";

/** Default financial calendar day for records whose date is not the point of the test. */
export const CALENDAR_EPOCH = "2026-01-01";

export function makeWallet(
  id: string,
  overrides: Partial<Wallet> = {},
): Wallet {
  return {
    id,
    name: id,
    type: "bank",
    provider: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    archivedAt: null,
    ...overrides,
  };
}

export function makeTarget(
  id: string,
  targetAmount = 10_000_000,
  overrides: Partial<SavingsTarget> = {},
): SavingsTarget {
  return {
    id,
    name: id,
    targetAmount,
    deadline: null,
    note: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    archivedAt: null,
    ...overrides,
  };
}

export function makeBudget(
  categoryId: string,
  month: string,
  limitAmount: number,
  overrides: Partial<Budget> = {},
): Budget {
  return {
    id: `budget-${categoryId}-${month}`,
    categoryId,
    month,
    limitAmount,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  };
}

type TxOverrides = Partial<Omit<Transaction, "id" | "type" | "amount">> & {
  id?: string;
  type?: Transaction["type"];
  amount?: number;
};

export function makeTx(overrides: TxOverrides = {}): Transaction {
  const { id = crypto.randomUUID(), type = "expense", amount = 1, ...rest } = overrides;
  return {
    id,
    type,
    amount,
    categoryId: null,
    sourceWalletId: null,
    destinationWalletId: null,
    savingsTargetId: null,
    paymentMethod: null,
    note: null,
    date: CALENDAR_EPOCH,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...rest,
  } as Transaction;
}

/** Empty, valid dataset (spec §27: the app starts empty, never with demo data). */
export function emptyData(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 3,
    wallets: [],
    categories: seedDefaultCategories(),
    transactions: [],
    savingsTargets: [],
    budgets: [],
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

/** ISO instant with an explicit UTC day, e.g. `at(2026, 1, 2)` -> 2026-01-02T00:00:00Z. */
export function at(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString();
}

/**
 * Financial calendar day — the `date` of a transaction is `YYYY-MM-DD` text, never
 * an instant, e.g. `on(2026, 1, 2)` -> "2026-01-02".
 */
export function on(year: number, month: number, day: number): string {
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${`${year}`.padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}
