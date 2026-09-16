import type { Transaction, SavingsTarget, Wallet } from "@/domain/models";
import { compareCalendarDates } from "@/domain/calendar";

/**
 * SmartSpend — ledger.
 *
 * THE LEDGER IS THE FINANCIAL SOURCE OF TRUTH.
 * Wallet balances and savings balances are *derived* from this module. No record
 * stores a mutable "current balance" anywhere in the app, which is why any edit,
 * delete or import automatically recalculates everything downstream.
 */

export type Ledger = readonly Transaction[];

/** Sign applied to a wallet for each transaction type. */
export function walletDelta(type: Transaction["type"]): -1 | 0 | 1 {
  switch (type) {
    case "income":
    case "opening_balance":
      return 1; // credits `destinationWalletId`
    case "expense":
    case "transfer":
    case "savings_deposit":
      return -1; // debits `sourceWalletId`
    case "savings_withdrawal":
      return 1; // credits `destinationWalletId`
  }
}

/** Sign applied to a savings target for each transaction type. */
export function savingsDelta(type: Transaction["type"]): -1 | 0 | 1 {
  switch (type) {
    case "savings_deposit":
      return 1;
    case "savings_withdrawal":
      return -1;
    default:
      return 0;
  }
}

/**
 * Signed effect of one record on ONE wallet (spec §18).
 *
 * A savings movement touches both pools: the wallet side is what keeps
 * `Total Money = wallets + savings` true. A deposit therefore debits its source
 * wallet and a withdrawal credits its destination wallet — and if a (legacy or
 * hand-edited) record also names a source wallet for a withdrawal, that wallet is
 * debited, so money can never be created out of nothing.
 */
export function transactionAffectsWallet(
  transaction: Transaction,
  walletId: string,
): -1 | 0 | 1 {
  switch (transaction.type) {
    case "income":
    case "opening_balance":
      return transaction.destinationWalletId === walletId ? 1 : 0;
    case "expense":
      return transaction.sourceWalletId === walletId ? -1 : 0;
    case "transfer":
      if (transaction.sourceWalletId === walletId) return -1;
      if (transaction.destinationWalletId === walletId) return 1;
      return 0;
    case "savings_deposit":
      if (transaction.sourceWalletId === walletId) return -1;
      if (transaction.destinationWalletId === walletId) return 1;
      return 0;
    case "savings_withdrawal":
      if (transaction.destinationWalletId === walletId) return 1;
      if (transaction.sourceWalletId === walletId) return -1;
      return 0;
  }
}

/**
 * Deterministic ledger ordering. DOCUMENTED RULE:
 *
 *   1. `date`      (financial calendar day)
 *   2. `createdAt` (record creation time; breaks ties for entries with the same
 *                   date, so a new same-day entry lands after existing ones)
 *   3. `id`        (stable final tiebreaker, e.g. records imported from JSON)
 *   4. `type`      (last-resort tiebreaker so two records with identical ids in a
 *                   malformed import still produce a stable, repeatable order)
 *
 * The sort is total and pure: the same ledger always produces the same order,
 * which is what makes chronological balance validation and "balance before this
 * transaction" reproducible. Implemented with an explicit comparator (not
 * `Array.prototype.sort` stability assumptions) so behaviour is identical across
 * engines.
 */
export function compareTransactions(a: Transaction, b: Transaction): number {
  const calendarOrder = compareCalendarDates(a.date, b.date);
  if (calendarOrder !== 0) return calendarOrder;

  const aCreated = Date.parse(a.createdAt);
  const bCreated = Date.parse(b.createdAt);
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  if (a.id !== b.id) return a.id < b.id ? -1 : 1;

  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return 0;
}

/** Sorted copy of the ledger (never mutates the input). */
export function sortTransactions(ledger: Ledger): Transaction[] {
  return [...ledger].sort(compareTransactions);
}

/* -------------------------------------------------------------------------- */
/* Balances                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Current wallet balance:
 *   + opening balance + income - expense - outgoing transfer
 *   + incoming transfer - savings deposit + savings withdrawal
 *
 * Archived wallets are still included: history must stay computable.
 */
export function calculateWalletBalance(ledger: Ledger, walletId: string): number {
  let balance = 0;
  for (const transaction of ledger) {
    const sign = transactionAffectsWallet(transaction, walletId);
    if (sign !== 0) balance += sign * transaction.amount;
  }
  return balance;
}

/** Savings balance = SUM(deposits) - SUM(withdrawals) for that target. */
export function calculateSavingsBalance(ledger: Ledger, savingsTargetId: string): number {
  let balance = 0;
  for (const transaction of ledger) {
    if (transaction.savingsTargetId !== savingsTargetId) continue;
    const sign = savingsDelta(transaction.type);
    if (sign !== 0) balance += sign * transaction.amount;
  }
  return balance;
}

/**
 * Wallet balance as of a transaction. When `upTo` already exists in `ledger`
 * the balance is taken *immediately before* that record — that is the number the
 * outflow must be covered by, and it is what makes "spend 80.000 from a wallet
 * that only has 50.000 today" rejectable even for backdated entries.
 */
export function getWalletBalanceAtDate(
  ledger: Ledger,
  walletId: string,
  upTo?: Pick<Transaction, "id" | "date">,
): number {
  const sorted = sortTransactions(ledger);
  const upToIndex = upTo ? sorted.findIndex((t) => t.id === upTo.id) : -1;

  let balance = 0;
  sorted.forEach((transaction, index) => {
    if (upToIndex >= 0) {
      if (index >= upToIndex) return;
    } else if (upTo && compareCalendarDates(transaction.date, upTo.date) >= 0) {
      return;
    }
    const sign = transactionAffectsWallet(transaction, walletId);
    if (sign !== 0) balance += sign * transaction.amount;
  });
  return balance;
}

/** Savings balance as of a transaction (same "immediately before" semantics). */
export function getSavingsBalanceAtDate(
  ledger: Ledger,
  savingsTargetId: string,
  upTo?: Pick<Transaction, "id" | "date">,
): number {
  const sorted = sortTransactions(ledger);
  const upToIndex = upTo ? sorted.findIndex((t) => t.id === upTo.id) : -1;

  let balance = 0;
  sorted.forEach((transaction, index) => {
    if (upToIndex >= 0) {
      if (index >= upToIndex) return;
    } else if (upTo && compareCalendarDates(transaction.date, upTo.date) >= 0) {
      return;
    }
    if (transaction.savingsTargetId !== savingsTargetId) return;
    const sign = savingsDelta(transaction.type);
    if (sign !== 0) balance += sign * transaction.amount;
  });
  return balance;
}

/**
 * Total Money (net worth) = SUM(wallet balances) + SUM(savings balances).
 * Savings live in a separate pool, so they are added exactly once — never also
 * counted inside a wallet (a deposit moved money out of the wallet).
 */
export function calculateTotalMoney(
  wallets: readonly Wallet[],
  savingsTargets: readonly SavingsTarget[],
  ledger: Ledger,
): { walletTotal: number; savingsTotal: number; total: number } {
  const walletBalances = wallets.map((wallet) => calculateWalletBalance(ledger, wallet.id));
  const savingsBalances = savingsTargets.map((target) =>
    calculateSavingsBalance(ledger, target.id),
  );
  const walletTotal = walletBalances.reduce((a, b) => a + b, 0);
  const savingsTotal = savingsBalances.reduce((a, b) => a + b, 0);
  return { walletTotal, savingsTotal, total: walletTotal + savingsTotal };
}

/** Convenience: balances of every wallet, in the order the wallets were given. */
export function calculateWalletBalances(
  wallets: readonly Wallet[],
  ledger: Ledger,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const wallet of wallets) map.set(wallet.id, calculateWalletBalance(ledger, wallet.id));
  return map;
}

export function calculateSavingsBalances(
  savingsTargets: readonly SavingsTarget[],
  ledger: Ledger,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const target of savingsTargets) {
    map.set(target.id, calculateSavingsBalance(ledger, target.id));
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Index helpers (avoids O(n^2) scans in selectors)                            */
/* -------------------------------------------------------------------------- */

export function indexWallets(wallets: readonly Wallet[]): Map<string, Wallet> {
  return new Map(wallets.map((wallet) => [wallet.id, wallet]));
}

export function indexSavingsTargets(
  targets: readonly SavingsTarget[],
): Map<string, SavingsTarget> {
  return new Map(targets.map((target) => [target.id, target]));
}

/** Every ledger record touching a wallet (as source or destination), ordered. */
export function transactionsForWallet(ledger: Ledger, walletId: string): Transaction[] {
  return sortTransactions(ledger).filter((transaction) =>
    transactionAffectsWallet(transaction, walletId) !== 0,
  );
}

export function transactionsForSavings(ledger: Ledger, savingsTargetId: string): Transaction[] {
  return sortTransactions(ledger).filter((transaction) => {
    if (transaction.savingsTargetId !== savingsTargetId) return false;
    return savingsDelta(transaction.type) !== 0;
  });
}
