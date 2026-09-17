import { calendarDateFromInstant, getTodayCalendarDate } from "@/domain/calendar";
import {
  calculateSavingsBalance,
  calculateWalletBalance,
  ledgerWithCandidate,
  ledgerWithout,
  sortTransactions,
  validateLedgerChronology,
  validateTransaction,
} from "@/domain";
import type { LedgerData } from "@/domain/validation";
import { budgetKey, type Budget, type Category, type NewBudget, type NewCategory, type NewSavingsTarget, type SavingsTarget, type Transaction, type Wallet } from "@/domain/models";
import { createId } from "@/domain/id";
import { formatIDR } from "@/domain/money";
import { getCategoryMeta, isSupportedCategoryIcon } from "@/domain/categories";
import { createEmptyData, type PersistedData } from "@/repository/storage-schema";
import { mutationError, type MutationError, type MutationResult } from "@/types";

/**
 * SmartSpend — application actions (pure part).
 *
 * These functions are the only way state changes. Each one:
 *   1. builds a *candidate* dataset (never mutates the stored one),
 *   2. validates the touched record + the whole affected chronology,
 *   3. returns the new dataset or a typed error.
 *
 * They are framework independent (no React, no localStorage) which is why the
 * financial test suite can drive the whole product without a DOM, and why the
 * Zustand store below is ~100 lines of plumbing.
 */

export type AppData = PersistedData;
export type { LedgerData };

/** Amounts are positive whole Rupiah; a fractional input is a bug, not a rounding job. */
function assertWholeAmount(amount: number, message: string): { ok: true; amount: number } | { ok: false; error: MutationError } {
  if (!Number.isSafeInteger(amount)) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message } };
  }
  return { ok: true, amount };
}

function commit(candidate: AppData): MutationResult<AppData> {
  const chronology = validateLedgerChronology(candidate.transactions, {
    wallets: candidate.wallets,
    savingsTargets: candidate.savingsTargets,
  });
  if (!chronology.valid) {
    return mutationError("VALIDATION_FAILED", chronology.error?.message ?? "Riwayat saldo menjadi tidak valid.");
  }
  return { ok: true, value: candidate };
}

/* -------------------------------------------------------------------------- */
/* Wallets                                                                      */
/* -------------------------------------------------------------------------- */

export interface CreateWalletInput {
  name: string;
  type: Wallet["type"];
  provider?: string | null;
  /** Stored as an `opening_balance` transaction — never as `wallet.balance`. */
  openingBalance: number;
  id?: string;
  now?: Date;
}

export function applyCreateWallet(data: AppData, input: CreateWalletInput): MutationResult<AppData> {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const walletId = input.id ?? createId();
  const openingCheck = assertWholeAmount(input.openingBalance, "Saldo awal harus bilangan bulat Rupiah.");
  if (!openingCheck.ok) return openingCheck;
  const wallet: Wallet = {
    id: walletId,
    name: input.name.trim(),
    type: input.type,
    provider: input.provider && input.provider.trim().length > 0 ? input.provider.trim() : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  const openingBalance = openingCheck.amount;
  const transactions = [...data.transactions];

  if (openingBalance !== 0) {
    if (openingBalance < 0) {
      return mutationError("VALIDATION_FAILED", "Saldo awal tidak valid.");
    }
    const opening: Transaction = {
      id: createId(),
      type: "opening_balance",
      amount: openingBalance,
      destinationWalletId: walletId,
      sourceWalletId: null,
      savingsTargetId: null,
      categoryId: null,
      paymentMethod: null,
      note: "Saldo awal dompet",
      date: getTodayCalendarDate(now),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    transactions.push(opening);
  }

  const candidate: AppData = { ...data, wallets: [...data.wallets, wallet], transactions };
  return commit(candidate);
}

export interface UpdateWalletInput {
  id: string;
  name: string;
  type: Wallet["type"];
  provider?: string | null;
  /** When provided, the opening-balance transaction is rewritten (still derived!). */
  openingBalance?: number | null;
  now?: Date;
}

export function applyUpdateWallet(data: AppData, input: UpdateWalletInput): MutationResult<AppData> {
  const wallet = data.wallets.find((candidate) => candidate.id === input.id);
  if (!wallet) return mutationError("NOT_FOUND", "Dompet tidak ditemukan.");

  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const updatedWallet: Wallet = {
    ...wallet,
    name: input.name.trim(),
    type: input.type,
    provider: input.provider && input.provider.trim().length > 0 ? input.provider.trim() : null,
    updatedAt: timestamp,
  };
  const wallets = data.wallets.map((candidate) => (candidate.id === wallet.id ? updatedWallet : candidate));
  let transactions = data.transactions;

  if (typeof input.openingBalance === "number") {
    const openingBalance = Math.trunc(input.openingBalance);
    if (openingBalance < 0 || !Number.isSafeInteger(openingBalance)) {
      return mutationError("VALIDATION_FAILED", "Saldo awal tidak valid.");
    }
    const existing = transactions.find(
      (transaction) =>
        transaction.type === "opening_balance" && transaction.destinationWalletId === wallet.id,
    );
    if (openingBalance === 0) {
      if (existing) transactions = ledgerWithout(transactions, existing.id);
    } else if (existing) {
      transactions = transactions.map((transaction) =>
        transaction.id === existing.id
          ? { ...transaction, amount: openingBalance, updatedAt: timestamp }
          : transaction,
      );
    } else {
      transactions = [
        ...transactions,
        {
          id: createId(),
          type: "opening_balance",
          amount: openingBalance,
          destinationWalletId: wallet.id,
          sourceWalletId: null,
          savingsTargetId: null,
          categoryId: null,
          paymentMethod: null,
          note: "Saldo awal dompet",
          date: calendarDateFromInstant(new Date(wallet.createdAt)),
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies Transaction,
      ];
    }
    transactions = sortTransactions(transactions);
  }

  const candidate: AppData = { ...data, wallets, transactions };
  const chronology = validateLedgerChronology(candidate.transactions, {
    wallets: candidate.wallets,
    savingsTargets: candidate.savingsTargets,
  });
  if (!chronology.valid) {
    return mutationError("VALIDATION_FAILED", chronology.error?.message ?? "Perubahan membuat riwayat saldo negatif.");
  }
  return { ok: true, value: candidate };
}

export function applyArchiveWallet(data: AppData, walletId: string, now: Date = new Date()): MutationResult<AppData> {
  const wallet = data.wallets.find((candidate) => candidate.id === walletId);
  if (!wallet) return mutationError("NOT_FOUND", "Dompet tidak ditemukan.");
  if (wallet.archivedAt) return mutationError("ARCHIVED", "Dompet sudah diarsipkan.");
  const timestamp = now.toISOString();
  const wallets = data.wallets.map((candidate) =>
    candidate.id === walletId ? { ...candidate, archivedAt: timestamp, updatedAt: timestamp } : candidate,
  );
  // Archiving never deletes transactions: history must stay computable.
  return { ok: true, value: { ...data, wallets } };
}

export function applyRestoreWallet(data: AppData, walletId: string, now: Date = new Date()): MutationResult<AppData> {
  const wallet = data.wallets.find((candidate) => candidate.id === walletId);
  if (!wallet) return mutationError("NOT_FOUND", "Dompet tidak ditemukan.");
  const timestamp = now.toISOString();
  const wallets = data.wallets.map((candidate) =>
    candidate.id === walletId ? { ...candidate, archivedAt: null, updatedAt: timestamp } : candidate,
  );
  return { ok: true, value: { ...data, wallets } };
}

/* -------------------------------------------------------------------------- */
/* Savings targets                                                              */
/* -------------------------------------------------------------------------- */

export interface CreateSavingsTargetInput extends NewSavingsTarget {
  now?: Date;
}

export function applyCreateSavingsTarget(
  data: AppData,
  input: CreateSavingsTargetInput,
): MutationResult<AppData> {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const goal = assertWholeAmount(input.targetAmount, "Target tabungan harus bilangan bulat Rupiah.");
  if (!goal.ok) return goal;
  const target: SavingsTarget = {
    id: input.id ?? createId(),
    name: input.name.trim(),
    targetAmount: goal.amount,
    deadline: input.deadline ?? null,
    note: input.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
  return { ok: true, value: { ...data, savingsTargets: [...data.savingsTargets, target] } };
}

export function applyUpdateSavingsTarget(
  data: AppData,
  id: string,
  patch: Partial<Pick<SavingsTarget, "name" | "targetAmount" | "deadline" | "note">>,
  now: Date = new Date(),
): MutationResult<AppData> {
  const target = data.savingsTargets.find((candidate) => candidate.id === id);
  if (!target) return mutationError("NOT_FOUND", "Target tabungan tidak ditemukan.");
  if (typeof patch.targetAmount === "number" && !Number.isSafeInteger(patch.targetAmount)) {
    return mutationError("VALIDATION_FAILED", "Target tabungan harus bilangan bulat Rupiah.");
  }
  if (typeof patch.targetAmount === "number" && patch.targetAmount < 1) {
    return mutationError("VALIDATION_FAILED", "Target tabungan minimal Rp1.");
  }
  const timestamp = now.toISOString();
  const savingsTargets = data.savingsTargets.map((candidate) =>
    candidate.id === id
      ? {
          ...candidate,
          ...patch,
          ...(typeof patch.name === "string" ? { name: patch.name.trim() } : {}),
          ...(typeof patch.targetAmount === "number" ? { targetAmount: patch.targetAmount } : {}),
          updatedAt: timestamp,
        }
      : candidate,
  );
  return { ok: true, value: { ...data, savingsTargets } };
}

export function applyArchiveSavingsTarget(
  data: AppData,
  id: string,
  now: Date = new Date(),
): MutationResult<AppData> {
  const target = data.savingsTargets.find((candidate) => candidate.id === id);
  if (!target) return mutationError("NOT_FOUND", "Target tabungan tidak ditemukan.");
  const timestamp = now.toISOString();
  const savingsTargets = data.savingsTargets.map((candidate) =>
    candidate.id === id ? { ...candidate, archivedAt: timestamp, updatedAt: timestamp } : candidate,
  );
  return { ok: true, value: { ...data, savingsTargets } };
}

export function applyRestoreSavingsTarget(
  data: AppData,
  id: string,
  now: Date = new Date(),
): MutationResult<AppData> {
  const target = data.savingsTargets.find((candidate) => candidate.id === id);
  if (!target) return mutationError("NOT_FOUND", "Target tabungan tidak ditemukan.");
  const savingsTargets = data.savingsTargets.map((candidate) =>
    candidate.id === id ? { ...candidate, archivedAt: null, updatedAt: now.toISOString() } : candidate,
  );
  return { ok: true, value: { ...data, savingsTargets } };
}


/* -------------------------------------------------------------------------- */
/* Categories                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateCategoryInput extends Omit<NewCategory, "createdAt" | "updatedAt" | "archivedAt" | "color"> {
  now?: Date;
}

export function normaliseCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function duplicateActiveCategoryName(categories: readonly Category[], name: string, type: Category["type"], exceptId?: string): boolean {
  const normalized = normaliseCategoryName(name).toLocaleLowerCase("id-ID");
  return categories.some(
    (category) =>
      category.id !== exceptId &&
      category.type === type &&
      category.archivedAt == null &&
      category.label.toLocaleLowerCase("id-ID") === normalized,
  );
}

export function applyCreateCategory(data: AppData, input: CreateCategoryInput): MutationResult<AppData> {
  const label = normaliseCategoryName(input.label);
  if (label.length < 1) return mutationError("VALIDATION_FAILED", "Nama kategori wajib diisi.");
  if (label.length > 40) return mutationError("VALIDATION_FAILED", "Nama kategori maksimal 40 karakter.");
  if (input.type !== "expense" && input.type !== "income") return mutationError("VALIDATION_FAILED", "Jenis kategori tidak valid.");
  if (!isSupportedCategoryIcon(input.icon)) return mutationError("VALIDATION_FAILED", "Icon kategori tidak valid.");
  if (duplicateActiveCategoryName(data.categories, label, input.type)) {
    return mutationError("VALIDATION_FAILED", "Kategori aktif dengan nama ini sudah ada untuk jenis yang sama.");
  }
  const timestamp = (input.now ?? new Date()).toISOString();
  const category: Category = {
    id: input.id ?? createId(),
    label,
    type: input.type,
    icon: input.icon,
    color: input.type === "expense" ? "slate" : "teal",
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
  return { ok: true, value: { ...data, categories: [...data.categories, category] } };
}

export function applyUpdateCategory(
  data: AppData,
  id: string,
  patch: Partial<Pick<Category, "label" | "icon">>,
  now: Date = new Date(),
): MutationResult<AppData> {
  const existing = data.categories.find((category) => category.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Kategori tidak ditemukan.");
  const label = patch.label === undefined ? existing.label : normaliseCategoryName(patch.label);
  if (label.length < 1) return mutationError("VALIDATION_FAILED", "Nama kategori wajib diisi.");
  if (label.length > 40) return mutationError("VALIDATION_FAILED", "Nama kategori maksimal 40 karakter.");
  const icon = patch.icon ?? existing.icon;
  if (!isSupportedCategoryIcon(icon)) return mutationError("VALIDATION_FAILED", "Icon kategori tidak valid.");
  if (existing.archivedAt == null && duplicateActiveCategoryName(data.categories, label, existing.type, id)) {
    return mutationError("VALIDATION_FAILED", "Kategori aktif dengan nama ini sudah ada untuk jenis yang sama.");
  }
  const categories = data.categories.map((category) =>
    category.id === id ? { ...category, label, icon, updatedAt: now.toISOString() } : category,
  );
  return { ok: true, value: { ...data, categories } };
}

export function applyArchiveCategory(data: AppData, id: string, now: Date = new Date()): MutationResult<AppData> {
  const existing = data.categories.find((category) => category.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Kategori tidak ditemukan.");
  if (existing.archivedAt) return mutationError("ARCHIVED", "Kategori sudah diarsipkan.");
  const timestamp = now.toISOString();
  return {
    ok: true,
    value: {
      ...data,
      categories: data.categories.map((category) =>
        category.id === id ? { ...category, archivedAt: timestamp, updatedAt: timestamp } : category,
      ),
    },
  };
}

export function applyRestoreCategory(data: AppData, id: string, now: Date = new Date()): MutationResult<AppData> {
  const existing = data.categories.find((category) => category.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Kategori tidak ditemukan.");
  if (duplicateActiveCategoryName(data.categories, existing.label, existing.type, id)) {
    return mutationError("VALIDATION_FAILED", "Nama kategori ini sudah dipakai kategori aktif lain.");
  }
  return {
    ok: true,
    value: {
      ...data,
      categories: data.categories.map((category) =>
        category.id === id ? { ...category, archivedAt: null, updatedAt: now.toISOString() } : category,
      ),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                                 */
/* -------------------------------------------------------------------------- */

export interface CreateTransactionBase {
  amount: number;
  date: string;
  note?: string | null;
  paymentMethod?: Transaction["paymentMethod"];
  categoryId?: string | null;
  sourceWalletId?: string | null;
  destinationWalletId?: string | null;
  savingsTargetId?: string | null;
  id?: string;
  now?: Date;
}

export function applyCreateTransaction(
  data: AppData,
  input: CreateTransactionBase & { type: Transaction["type"] },
): MutationResult<AppData> {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const whole = assertWholeAmount(input.amount, "Nominal harus bilangan bulat Rupiah (tanpa sen).");
  if (!whole.ok) return whole;
  const amount = whole.amount;

  const transaction = {
    id: input.id ?? createId(),
    type: input.type,
    amount,
    categoryId: input.categoryId ?? null,
    sourceWalletId: input.sourceWalletId ?? null,
    destinationWalletId: input.destinationWalletId ?? null,
    savingsTargetId: input.savingsTargetId ?? null,
    paymentMethod: input.paymentMethod ?? null,
    note: input.note && input.note.trim().length > 0 ? input.note.trim() : null,
    date: input.date,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as unknown as Transaction;

  const result = validateTransaction(transaction, {
    wallets: data.wallets,
    savingsTargets: data.savingsTargets,
    categories: data.categories,
    // Candidate included: availability is measured strictly before this record
    // (see ValidateTransactionContext). Passing the stored ledger alone would let
    // a new record fund itself when it sorts before the money that covers it.
    transactions: ledgerWithCandidate(data.transactions, transaction),
    now,
  });
  if (!result.ok) {
    const fields: Record<string, string> = {};
    for (const error of result.error.allErrors ?? [result.error]) {
      if (error.field && !fields[error.field]) fields[error.field] = error.message;
    }
    return { ok: false, error: { code: "VALIDATION_FAILED", message: result.error.message, fields } };
  }

  const candidate: AppData = { ...data, transactions: sortTransactions([...data.transactions, transaction]) };
  const chronology = validateLedgerChronology(candidate.transactions, {
    wallets: candidate.wallets,
    savingsTargets: candidate.savingsTargets,
  });
  if (!chronology.valid) {
    return mutationError("VALIDATION_FAILED", chronology.error?.message ?? "Transaksi membuat riwayat saldo negatif.");
  }
  return { ok: true, value: candidate };
}

export function applyUpdateTransaction(
  data: AppData,
  id: string,
  input: CreateTransactionBase & { type: Transaction["type"] },
): MutationResult<AppData> {
  const existing = data.transactions.find((transaction) => transaction.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Transaksi tidak ditemukan.");

  const now = input.now ?? new Date();
  const whole = assertWholeAmount(input.amount, "Nominal harus bilangan bulat Rupiah (tanpa sen).");
  if (!whole.ok) return whole;
  const updated = {
    ...existing,
    ...input,
    amount: whole.amount,
    id,
    createdAt: existing.createdAt,
    updatedAt: now.toISOString(),
    categoryId: input.categoryId ?? null,
    sourceWalletId: input.sourceWalletId ?? null,
    destinationWalletId: input.destinationWalletId ?? null,
    savingsTargetId: input.savingsTargetId ?? null,
    paymentMethod: input.paymentMethod ?? null,
    note: input.note && input.note.trim().length > 0 ? input.note.trim() : null,
  } as unknown as Transaction;

  const withoutExisting = ledgerWithout(data.transactions, id);
  const result = validateTransaction(updated, {
    wallets: data.wallets,
    savingsTargets: data.savingsTargets,
    categories: data.categories,
    // Replace the stored version with the candidate, then measure availability
    // before it — so an edit may reuse the money the old version had tied up.
    transactions: ledgerWithCandidate(data.transactions, updated),
    now,
  });
  if (!result.ok) {
    const fields: Record<string, string> = {};
    for (const error of result.error.allErrors ?? [result.error]) {
      if (error.field && !fields[error.field]) fields[error.field] = error.message;
    }
    return { ok: false, error: { code: "VALIDATION_FAILED", message: result.error.message, fields } };
  }

  const candidate: AppData = {
    ...data,
    transactions: sortTransactions([...withoutExisting, updated]),
  };
  const chronology = validateLedgerChronology(candidate.transactions, {
    wallets: candidate.wallets,
    savingsTargets: candidate.savingsTargets,
  });
  if (!chronology.valid) {
    return mutationError("VALIDATION_FAILED", chronology.error?.message ?? "Perubahan membuat riwayat saldo negatif.");
  }
  return { ok: true, value: candidate };
}

/**
 * Deleting a record is a *ledger* operation, not a list edit: the candidate
 * ledger without it must still be chronologically valid (e.g. deleting a wallet's
 * only opening balance while expenses reference it is refused).
 */
export function applyDeleteTransaction(data: AppData, id: string): MutationResult<AppData> {
  const existing = data.transactions.find((transaction) => transaction.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Transaksi tidak ditemukan.");
  const candidate: AppData = { ...data, transactions: ledgerWithout(data.transactions, id) };
  return commit(candidate);
}

export function applyDeleteWallet(data: AppData, walletId: string): MutationResult<AppData> {
  const wallet = data.wallets.find((candidate) => candidate.id === walletId);
  if (!wallet) return mutationError("NOT_FOUND", "Dompet tidak ditemukan.");
  const referencing = data.transactions.filter(
    (transaction) => transaction.sourceWalletId === walletId || transaction.destinationWalletId === walletId,
  );
  if (referencing.length > 0) {
    return mutationError(
      "ARCHIVED",
      `Dompet ini punya ${referencing.length} transaksi. Gunakan Arsipkan agar riwayat tetap utuh.`,
    );
  }
  return { ok: true, value: { ...data, wallets: data.wallets.filter((candidate) => candidate.id !== walletId) } };
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                      */
/* -------------------------------------------------------------------------- */

export function applyCreateBudget(data: AppData, input: NewBudget, now: Date = new Date()): MutationResult<AppData> {
  const timestamp = now.toISOString();
  const limit = assertWholeAmount(input.limitAmount, "Limit budget harus bilangan bulat Rupiah.");
  if (!limit.ok) return limit;
  const budget: Budget = {
    id: input.id ?? createId(),
    categoryId: input.categoryId,
    month: input.month,
    limitAmount: limit.amount,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const meta = getCategoryMeta(budget.categoryId, data.categories);
  if (!meta || meta.type !== "expense" || meta.archivedAt != null) {
    return mutationError("VALIDATION_FAILED", "Pilih kategori pengeluaran aktif.");
  }
  const duplicate = data.budgets.some((candidate) => budgetKey(candidate) === budgetKey(budget));
  if (duplicate) {
    return mutationError("VALIDATION_FAILED", "Budget untuk kategori & bulan ini sudah ada. Ubah yang lama.");
  }
  return { ok: true, value: { ...data, budgets: [...data.budgets, budget] } };
}

export function applyUpdateBudget(
  data: AppData,
  id: string,
  patch: Partial<Pick<Budget, "categoryId" | "month" | "limitAmount">>,
  now: Date = new Date(),
): MutationResult<AppData> {
  const existing = data.budgets.find((budget) => budget.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Budget tidak ditemukan.");
  const updated: Budget = {
    ...existing,
    ...patch,
    ...(typeof patch.limitAmount === "number" ? { limitAmount: patch.limitAmount } : {}),
    updatedAt: now.toISOString(),
  };
  const meta = getCategoryMeta(updated.categoryId, data.categories);
  if (!meta || meta.type !== "expense") {
    return mutationError("VALIDATION_FAILED", "Pilih kategori pengeluaran.");
  }
  const duplicate = data.budgets.some(
    (candidate) => candidate.id !== id && budgetKey(candidate) === budgetKey(updated),
  );
  if (duplicate) {
    return mutationError("VALIDATION_FAILED", "Budget untuk kategori & bulan ini sudah ada. Ubah yang lama.");
  }
  return { ok: true, value: { ...data, budgets: data.budgets.map((budget) => (budget.id === id ? updated : budget)) } };
}

export function applyDeleteBudget(data: AppData, id: string): MutationResult<AppData> {
  const existing = data.budgets.find((budget) => budget.id === id);
  if (!existing) return mutationError("NOT_FOUND", "Budget tidak ditemukan.");
  return { ok: true, value: { ...data, budgets: data.budgets.filter((budget) => budget.id !== id) } };
}

/* -------------------------------------------------------------------------- */
/* Dataset level (import / reset)                                              */
/* -------------------------------------------------------------------------- */

export function applyReset(): AppData {
  return createEmptyData();
}

/** Re-exported so the store can show derived balances without touching the domain. */
export { calculateWalletBalance, calculateSavingsBalance, formatIDR };
