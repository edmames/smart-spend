import { getTodayCalendarDate, parseCalendarDate } from "@/domain/calendar";
import { categoryLabel, getCategoryMeta } from "@/domain/categories";
import {
  budgetKey,
  isActiveSavingsTarget,
  isActiveWallet,
  type Budget,
  type SavingsTarget,
  type Transaction,
  type Wallet,
} from "@/domain/models";
import {
  compareTransactions,
  getSavingsBalanceAtDate,
  getWalletBalanceAtDate,
  sortTransactions,
} from "@/domain/ledger";
import { findDuplicateBudgetKeys } from "@/domain/selectors";
import { fail, ok, type DomainError, type Result } from "@/domain/result";
import { formatIDR, MAX_MONEY, MIN_MONEY } from "@/domain/money";

/**
 * SmartSpend — ledger validation.
 *
 * Two layers, both pure:
 *
 *  A) `validateLedgerChronology` walks the *whole* ledger in deterministic order
 *    and refuses any state where a wallet or savings target would go negative at
 *    any point in time. This is what makes back-dated edits impossible to hide.
 *
 *  B) `validateTransaction` checks a single record against the ledger it would
 *    live in: schema/semantic shape, references, category/type agreement and
 *    available balance *at that moment*.
 *
 * Every create / edit / delete / import path in the app runs A over the resulting
 * candidate ledger, and B over the touched record. Nothing is persisted unless
 * both pass.
 */

export interface LedgerData {
  wallets: readonly Wallet[];
  transactions: readonly Transaction[];
  savingsTargets: readonly SavingsTarget[];
  budgets: readonly Budget[];
}

/** Same key used by storage validation so both layers agree on what "consistent" means. */
export const ledgerInvariants = (data: LedgerData) => {
  const errors: DomainError[] = [];
  const ids = new Map<string, string>();

  const collect = (records: { id: string }[], kind: string) => {
    for (const record of records) {
      const key = `${kind}:${record.id}`;
      if (ids.has(key)) {
        errors.push({
          code: "DUPLICATE_ID",
          message: `Terdapat ID ${kind} yang ganda (${record.id}).`,
        });
      }
      ids.set(key, kind);
    }
  };

  collect([...data.wallets], "wallet");
  collect([...data.transactions], "transaction");
  collect([...data.savingsTargets], "savings");
  collect([...data.budgets], "budget");

  const walletIds = new Set(data.wallets.map((wallet) => wallet.id));
  const savingsIds = new Set(data.savingsTargets.map((target) => target.id));

  for (const transaction of data.transactions) {
    for (const [field, id] of [
      ["sourceWalletId", transaction.sourceWalletId],
      ["destinationWalletId", transaction.destinationWalletId],
    ] as const) {
      if (id && !walletIds.has(id)) {
        errors.push({
          code: "UNKNOWN_WALLET",
          message: `Transaksi ${transaction.id} merujuk ${field === "sourceWalletId" ? "sumber" : "tujuan"} dompet yang tidak ada.`,
          transactionId: transaction.id,
        });
      }
    }
    if (transaction.savingsTargetId && !savingsIds.has(transaction.savingsTargetId)) {
      errors.push({
        code: "UNKNOWN_SAVINGS_TARGET",
        message: `Transaksi ${transaction.id} merujuk target tabungan yang tidak ada.`,
        transactionId: transaction.id,
      });
    }
    if (transaction.categoryId && !getCategoryMeta(transaction.categoryId)) {
      errors.push({
        code: "UNKNOWN_CATEGORY",
        message: `Transaksi ${transaction.id} memakai kategori yang tidak dikenal (${transaction.categoryId}).`,
        transactionId: transaction.id,
      });
    }
  }

  for (const budget of data.budgets) {
    if (!getCategoryMeta(budget.categoryId) || getCategoryMeta(budget.categoryId)?.type !== "expense") {
      errors.push({
        code: "UNKNOWN_CATEGORY",
        message: `Budget ${budget.id} memakai kategori pengeluaran yang tidak dikenal.`,
      });
    }
  }

  const duplicateBudgets = findDuplicateBudgetKeys(data.budgets);
  if (duplicateBudgets.length > 0) {
    errors.push({
      code: "DUPLICATE_BUDGET",
      message: `Satu kategori hanya boleh punya satu budget per bulan (${duplicateBudgets.map((k) => k.split("::")[0]).join(", ")}).`,
    });
  }

  return errors;
};

/* -------------------------------------------------------------------------- */
/* A) chronological balance integrity                                          */
/* -------------------------------------------------------------------------- */

export interface ChronologyIssue {
  transactionId: string;
  walletId?: string;
  savingsTargetId?: string;
  balanceAfter: number;
}

export interface ChronologyResult {
  valid: boolean;
  issues: ChronologyIssue[];
  error?: DomainError;
}

/**
 * Walk the ledger in deterministic order and keep running balances. Any wallet
 * or savings target that dips below zero at any point invalidates the ledger.
 */
export function validateLedgerChronology(
  transactions: readonly Transaction[],
  options: { wallets?: readonly Wallet[]; savingsTargets?: readonly SavingsTarget[] } = {},
): ChronologyResult {
  const walletBalances = new Map<string, number>((options.wallets ?? []).map((w) => [w.id, 0]));
  const savingsBalances = new Map<string, number>(
    (options.savingsTargets ?? []).map((t) => [t.id, 0]),
  );
  const issues: ChronologyIssue[] = [];

  for (const transaction of sortTransactions(transactions)) {
    if (transaction.sourceWalletId) {
      walletBalances.set(
        transaction.sourceWalletId,
        (walletBalances.get(transaction.sourceWalletId) ?? 0) - transaction.amount,
      );
    }
    if (transaction.destinationWalletId) {
      walletBalances.set(
        transaction.destinationWalletId,
        (walletBalances.get(transaction.destinationWalletId) ?? 0) + transaction.amount,
      );
    }
    if (transaction.savingsTargetId) {
      const delta = transaction.type === "savings_deposit" ? 1 : transaction.type === "savings_withdrawal" ? -1 : 0;
      if (delta !== 0) {
        savingsBalances.set(
          transaction.savingsTargetId,
          (savingsBalances.get(transaction.savingsTargetId) ?? 0) + delta * transaction.amount,
        );
      }
    }

    const record = (id: string, balance: number, kind: "wallet" | "savings") => {
      if (balance < 0) {
        issues.push({
          transactionId: transaction.id,
          balanceAfter: balance,
          ...(kind === "wallet" ? { walletId: id } : { savingsTargetId: id }),
        });
      }
    };

    if (transaction.sourceWalletId) {
      record(transaction.sourceWalletId, walletBalances.get(transaction.sourceWalletId) ?? 0, "wallet");
    }
    if (transaction.destinationWalletId) {
      record(
        transaction.destinationWalletId,
        walletBalances.get(transaction.destinationWalletId) ?? 0,
        "wallet",
      );
    }
    if (transaction.savingsTargetId) {
      record(
        transaction.savingsTargetId,
        savingsBalances.get(transaction.savingsTargetId) ?? 0,
        "savings",
      );
    }
  }

  if (issues.length === 0) return { valid: true, issues };

  const first = issues[0];
  const isSavings = first?.savingsTargetId !== undefined;
  const name = isSavings
    ? (options.savingsTargets ?? []).find((t) => t.id === first?.savingsTargetId)?.name
    : (options.wallets ?? []).find((w) => w.id === first?.walletId)?.name;

  return {
    valid: false,
    issues,
    error: {
      code: "NEGATIVE_HISTORICAL_BALANCE",
      field: isSavings ? "savings" : "wallet",
      message: `Perubahan ditolak: saldo ${name ? `${isSavings ? "tabungan" : "dompet"} "${name}"` : "akun"} akan menjadi negatif pada riwayat (${first?.balanceAfter ?? 0} Rp).`,
      transactionId: first?.transactionId,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* B) single transaction validation                                            */
/* -------------------------------------------------------------------------- */

export interface ValidateTransactionContext {
  wallets: readonly Wallet[];
  savingsTargets: readonly SavingsTarget[];
  /**
   * Ledger the record would live in, **including** the record being validated —
   * build it with `ledgerWithCandidate` so the merged list is sorted. "Available
   * balance" is then taken strictly before that record's position, which is what
   * makes a same-instant credit usable while an income recorded later cannot fund
   * an earlier expense (and a new record can never fund itself).
   */
  transactions: readonly Transaction[];
  now?: Date;
}

const WALLET_OUT_TYPES = new Set<Transaction["type"]>(["expense", "transfer", "savings_deposit"]);
const SAVINGS_OUT_TYPE: Transaction["type"] = "savings_withdrawal";

export function validateTransaction(
  transaction: Transaction,
  context: ValidateTransactionContext,
): Result<Transaction> {
  const wallets = new Map(context.wallets.map((wallet) => [wallet.id, wallet]));
  const savings = new Map(context.savingsTargets.map((target) => [target.id, target]));
  const errors: DomainError[] = [];

  const push = (error: DomainError) => errors.push(error);

  // --- references -----------------------------------------------------------
  const requireWallet = (id: string | null | undefined, role: "source" | "destination") => {
    if (!id) {
      push({
        code: role === "source" ? "MISSING_SOURCE_WALLET" : "MISSING_DESTINATION_WALLET",
        field: "wallet",
        message: role === "source" ? "Pilih dompet sumber." : "Pilih dompet tujuan.",
      });
      return undefined;
    }
    const wallet = wallets.get(id);
    if (!wallet) {
      push({ code: "UNKNOWN_WALLET", field: "wallet", message: "Dompet yang dipilih tidak ada." });
      return undefined;
    }
    return wallet;
  };

  const requireSavings = (id: string | null | undefined) => {
    if (!id) {
      push({
        code: "MISSING_SAVINGS_TARGET",
        field: "savings",
        message: "Pilih target tabungan.",
      });
      return undefined;
    }
    const target = savings.get(id);
    if (!target) {
      push({
        code: "UNKNOWN_SAVINGS_TARGET",
        field: "savings",
        message: "Target tabungan yang dipilih tidak ada.",
      });
      return undefined;
    }
    return target;
  };

  let sourceWallet: Wallet | undefined;
  let destinationWallet: Wallet | undefined;
  let savingsTarget: SavingsTarget | undefined;

  switch (transaction.type) {
    case "income":
    case "opening_balance":
      destinationWallet = requireWallet(transaction.destinationWalletId, "destination");
      if (transaction.sourceWalletId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "wallet",
          message: "Transaksi pemasukan tidak boleh memiliki dompet sumber.",
        });
      }
      if (transaction.savingsTargetId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "savings",
          message: "Transaksi pemasukan tidak boleh memiliki target tabungan.",
        });
      }
      break;
    case "expense":
    case "transfer":
    case "savings_deposit":
      sourceWallet = requireWallet(transaction.sourceWalletId, "source");
      break;
    case "savings_withdrawal":
      destinationWallet = requireWallet(transaction.destinationWalletId, "destination");
      break;
  }

  switch (transaction.type) {
    case "transfer":
      destinationWallet = requireWallet(transaction.destinationWalletId, "destination");
      if (transaction.savingsTargetId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "savings",
          message: "Transfer antar dompet tidak boleh memiliki target tabungan.",
        });
      }
      if (transaction.categoryId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "category",
          message: "Transfer tidak memakai kategori — itu bukan pemasukan/pengeluaran.",
        });
      }
      if (sourceWallet && destinationWallet && sourceWallet.id === destinationWallet.id) {
        push({
          code: "SOURCE_EQUALS_DESTINATION",
          field: "wallet",
          message: "Dompet sumber dan tujuan tidak boleh sama.",
        });
      }
      if (transaction.sourceWalletId && !transaction.destinationWalletId) {
        push({
          code: "MISSING_DESTINATION_WALLET",
          field: "wallet",
          message: "Transfer membutuhkan dompet tujuan.",
        });
      }
      break;
    case "savings_deposit":
      savingsTarget = requireSavings(transaction.savingsTargetId);
      if (transaction.destinationWalletId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "wallet",
          message: "Setoran tabungan tidak memiliki dompet tujuan.",
        });
      }
      if (transaction.categoryId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "category",
          message: "Setoran tabungan bukan pengeluaran, jadi tidak memakai kategori.",
        });
      }
      break;
    case "savings_withdrawal": {
      savingsTarget = requireSavings(transaction.savingsTargetId);
      if (transaction.sourceWalletId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "wallet",
          message: "Penarikan tabungan tidak memiliki dompet sumber.",
        });
      }
      if (transaction.categoryId) {
        push({
          code: "UNEXPECTED_FIELD",
          field: "category",
          message: "Penarikan tabungan bukan pemasukan, jadi tidak memakai kategori.",
        });
      }
      break;
    }
    default:
      break;
  }

  // --- category / type agreement -------------------------------------------
  const meta = getCategoryMeta(transaction.categoryId);
  if (transaction.categoryId) {
    if (!meta) {
      push({
        code: "UNKNOWN_CATEGORY",
        field: "category",
        message: `Kategori tidak dikenal: ${transaction.categoryId}.`,
      });
    } else if (meta.type !== transaction.type) {
      push({
        code: "CATEGORY_TYPE_MISMATCH",
        field: "category",
        message: `Kategori "${categoryLabel(transaction.categoryId)}" adalah kategori ${meta.type === "income" ? "pemasukan" : "pengeluaran"} dan tidak bisa dipakai di transaksi ini.`,
      });
    }
  } else if (transaction.type === "expense") {
    push({ code: "UNKNOWN_CATEGORY", field: "category", message: "Pilih kategori pengeluaran." });
  }

  // --- archiving ------------------------------------------------------------
  if (destinationWallet && !isActiveWallet(destinationWallet)) {
    push({
      code: "DESTINATION_ARCHIVED",
      field: "wallet",
      message: `Dompet "${destinationWallet.name}" sudah diarsipkan dan tidak bisa menerima transaksi baru.`,
    });
  }
  if (sourceWallet && !isActiveWallet(sourceWallet)) {
    push({
      code: "SOURCE_ARCHIVED",
      field: "wallet",
      message: `Dompet "${sourceWallet.name}" sudah diarsipkan dan tidak bisa dipakai untuk transaksi baru.`,
    });
  }
  if (savingsTarget && !isActiveSavingsTarget(savingsTarget)) {
    push({
      code: "UNKNOWN_SAVINGS_TARGET",
      field: "savings",
      message: `Target tabungan "${savingsTarget.name}" sudah diarsipkan.`,
    });
  }

  // --- amount ---------------------------------------------------------------
  // The form schema also enforces this, but the domain must not rely on the UI:
  // amounts are positive whole Rupiah, and import payloads reach this function too.
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount < MIN_MONEY || transaction.amount > MAX_MONEY) {
    push({
      code: "INVALID_AMOUNT",
      field: "amount",
      message:
        transaction.amount > MAX_MONEY
          ? "Nominal maksimal adalah Rp9.999.999.999."
          : "Nominal harus bilangan bulat Rp1 ke atas (tanpa sen, tanpa nol).",
    });
  }

  // --- dates ----------------------------------------------------------------
  const now = context.now ?? new Date();
  if (!parseCalendarDate(transaction.date)) {
    push({ code: "INVALID_DATE", field: "date", message: "Tanggal transaksi tidak valid." });
  } else if (transaction.date > getTodayCalendarDate(now)) {
    push({
      code: "FUTURE_DATE",
      field: "date",
      message: "Tanggal transaksi tidak boleh di masa depan.",
    });
  }

  // --- available balance at that point in time ------------------------------
  // The ledger used for "balance before" excludes the record being validated
  // (callers pass a candidate ledger), so a same-instant record is already
  // accounted for and a re-validated record is not double counted.
  if (sourceWallet && WALLET_OUT_TYPES.has(transaction.type)) {
    const available = getWalletBalanceAtDate(context.transactions, sourceWallet.id, {
      id: transaction.id,
      date: transaction.date,
    });
    if (transaction.amount > available) {
      push({
        code: "INSUFFICIENT_WALLET_BALANCE",
        field: "wallet",
        walletId: sourceWallet.id,
        message: `Saldo ${sourceWallet.name} tidak cukup (tersedia ${formatIDR(available)}, dibutuhkan ${formatIDR(transaction.amount)}).`,
      });
    }
  }
  if (savingsTarget && transaction.type === SAVINGS_OUT_TYPE) {
    const available = getSavingsBalanceAtDate(context.transactions, savingsTarget.id, {
      id: transaction.id,
      date: transaction.date,
    });
    if (transaction.amount > available) {
      push({
        code: "INSUFFICIENT_SAVINGS_BALANCE",
        field: "savings",
        savingsTargetId: savingsTarget.id,
        message: `Saldo tabungan ${savingsTarget.name} tidak cukup (tersedia ${formatIDR(available)}, dibutuhkan ${formatIDR(transaction.amount)}).`,
      });
    }
  }

  if (errors.length > 0) {
    const first = errors.find((error) => error.field !== undefined) ?? (errors[0] as DomainError);
    return fail<Transaction>({ ...first, allErrors: errors } as DomainError);
  }

  return ok(transaction);
}

/* -------------------------------------------------------------------------- */
/* Candidate-ledger helpers (edit / delete / import)                          */
/* -------------------------------------------------------------------------- */

export function ledgerWithout(ledger: readonly Transaction[], transactionId: string): Transaction[] {
  return ledger.filter((transaction) => transaction.id !== transactionId);
}

export function ledgerWithCandidate(
  ledger: readonly Transaction[],
  candidate: Transaction,
): Transaction[] {
  const withoutExisting = ledgerWithout(ledger, candidate.id);
  const merged = [...withoutExisting, candidate];
  return sortTransactions(merged);
}

/** Full structural + chronological check used by import and by every mutation. */
export function validateLedgerIntegrity(data: LedgerData): Result<LedgerData> {
  const structural = ledgerInvariants(data);
  if (structural.length > 0) {
    return fail(structural[0] as DomainError);
  }
  const chronology = validateLedgerChronology(data.transactions, {
    wallets: data.wallets,
    savingsTargets: data.savingsTargets,
  });
  if (!chronology.valid && chronology.error) {
    return fail(chronology.error);
  }
  return ok(data);
}

/** Exposed for tests: the comparator is the ordering contract, verifiable directly. */
export { compareTransactions, budgetKey };
