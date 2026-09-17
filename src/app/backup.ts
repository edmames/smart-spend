import { validateLedgerChronology } from "@/domain/validation";
import type { Budget, Category, SavingsTarget, Transaction, Wallet } from "@/domain/models";
import { budgetKey } from "@/domain/models";
import {
  createEmptyData,
  persistedDataSchema,
  migratePayload,
  STORAGE_VERSION,
  type PersistedData,
} from "@/repository/storage-schema";
import type { ExportMeta, ImportPreview } from "@/types";

/**
 * SmartSpend — JSON export / import.
 *
 * The export payload is a *superset* of the persisted envelope (same field
 * names, plus `appName`/`schemaVersion`/`exportedAt`), so an exported file can be
 * fed straight back into the same validation pipeline as stored data. That is on
 * purpose: one validation path, no "import-only" rules that could drift.
 *
 * V1 import semantics: validate everything or nothing, preview the counts,
 * require an explicit confirmation, then replace the dataset wholesale.
 */

export interface ExportPayload {
  appName: "SmartSpend";
  schemaVersion: number;
  exportedAt: string;
  version: number;
  wallets: Wallet[];
  transactions: Transaction[];
  savingsTargets: SavingsTarget[];
  budgets: Budget[];
  categories: Category[];
  settings: PersistedData["settings"];
}

/** "Safe settings" = the whitelisted settings object only; nothing else is exported. */
export function buildExportPayload(data: PersistedData, now: Date = new Date()): ExportPayload {
  return {
    appName: "SmartSpend",
    schemaVersion: STORAGE_VERSION,
    exportedAt: now.toISOString(),
    version: data.version,
    wallets: data.wallets,
    transactions: data.transactions,
    savingsTargets: data.savingsTargets,
    budgets: data.budgets,
    categories: data.categories,
    settings: data.settings ?? null,
  };
}

export function serializeExport(data: PersistedData, now: Date = new Date()): string {
  return JSON.stringify(buildExportPayload(data, now), null, 2);
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `smarts-export-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}.json`;
}

export interface DownloadArtifact {
  filename: string;
  contents: string;
}

export function buildExportArtifact(data: PersistedData, now: Date = new Date()): DownloadArtifact {
  return { filename: exportFileName(now), contents: serializeExport(data, now) };
}

/* -------------------------------------------------------------------------- */
/* Import                                                                       */
/* -------------------------------------------------------------------------- */

export type ImportIssue = { path: string; message: string };

export type ImportValidation =
  | { ok: true; data: PersistedData; preview: ImportPreview; warnings: string[] }
  | { ok: false; message: string; issues: ImportIssue[] };

function previewOf(data: PersistedData): ImportPreview {
  const months = new Set(data.budgets.map((budget) => budget.month));
  const dates = data.transactions.map((transaction) => transaction.date).sort();
  return {
    schemaVersion: data.version,
    counts: {
      wallets: data.wallets.length,
      transactions: data.transactions.length,
      savingsTargets: data.savingsTargets.length,
      budgets: data.budgets.length,
    },
    monthsWithBudgets: [...months].sort(),
    firstTransactionDate: dates[0] ?? null,
    lastTransactionDate: dates.length > 0 ? (dates[dates.length - 1] as string) : null,
  };
}

/**
 * Validate a whole file. Structural (Zod) problems, duplicate ids, dangling
 * references and chronologically impossible balances each reject the *entire*
 * import — a partially applied import is worse than none.
 */
export function validateImportPayload(raw: unknown): ImportValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "File harus berisi satu objek JSON SmartSpend.", issues: [] };
  }

  const source = raw as Record<string, unknown>;
  const version = source.version ?? source.schemaVersion;
  if (version === undefined) {
    return { ok: false, message: "File tidak memiliki schemaVersion/version.", issues: [] };
  }
  if (typeof version === "number" && version > STORAGE_VERSION) {
    return {
      ok: false,
      message: `File ini dibuat dengan skema v${version}; aplikasi ini mendukung hingga v${STORAGE_VERSION}.`,
      issues: [{ path: "version", message: `Didukung: <= ${STORAGE_VERSION}` }],
    };
  }

  const candidate = {
    version,
    wallets: source.wallets ?? [],
    transactions: source.transactions ?? [],
    savingsTargets: source.savingsTargets ?? [],
    budgets: source.budgets ?? [],
    categories: source.categories,
    settings: source.settings ?? null,
  };

  const migration = migratePayload(candidate);
  const parsed = persistedDataSchema.safeParse(migration?.payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Struktur file tidak sesuai skema SmartSpend — seluruh import ditolak.",
      issues: parsed.error.issues.slice(0, 25).map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    };
  }

  const data = parsed.data as PersistedData;
  const issues: ImportIssue[] = [];

  const seen = new Map<string, number>();
  const checkUnique = (kind: string, records: { id: string }[]) => {
    for (const record of records) {
      const key = `${kind}:${record.id}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  };
  checkUnique("wallet", data.wallets);
  checkUnique("transaction", data.transactions);
  checkUnique("savings", data.savingsTargets);
  checkUnique("budget", data.budgets);
  for (const [key, count] of seen) {
    if (count > 1) issues.push({ path: key, message: `ID muncul ${count}x (harus unik).` });
  }

  const walletIds = new Set(data.wallets.map((wallet) => wallet.id));
  const savingsIds = new Set(data.savingsTargets.map((target) => target.id));
  data.transactions.forEach((transaction, index) => {
    if (transaction.sourceWalletId && !walletIds.has(transaction.sourceWalletId)) {
      issues.push({ path: `transactions[${index}].sourceWalletId`, message: "Dompet sumber tidak ada di file." });
    }
    if (transaction.destinationWalletId && !walletIds.has(transaction.destinationWalletId)) {
      issues.push({
        path: `transactions[${index}].destinationWalletId`,
        message: "Dompet tujuan tidak ada di file.",
      });
    }
    if (transaction.savingsTargetId && !savingsIds.has(transaction.savingsTargetId)) {
      issues.push({ path: `transactions[${index}].savingsTargetId`, message: "Target tabungan tidak ada di file." });
    }
  });

  const duplicateBudgets = new Set<string>();
  const budgets = new Set<string>();
  for (const budget of data.budgets) {
    const key = budgetKey(budget);
    if (budgets.has(key)) duplicateBudgets.add(key);
    budgets.add(key);
  }
  for (const key of duplicateBudgets) {
    issues.push({ path: `budgets:${key}`, message: "Kategori yang sama punya dua budget di bulan yang sama." });
  }

  const chronology = validateLedgerChronology(data.transactions, {
    wallets: data.wallets,
    savingsTargets: data.savingsTargets,
  });
  if (!chronology.valid) {
    issues.push({ path: "transactions", message: chronology.error?.message ?? "Riwayat saldo menjadi negatif." });
  }

  if (issues.length > 0) {
    return { ok: false, message: "File lolos parsing tapi gagal validasi — seluruh import ditolak.", issues: issues.slice(0, 25) };
  }

  const warnings: string[] = [];
  if (data.wallets.length === 0) warnings.push("File tidak berisi dompet sama sekali.");
  if (data.transactions.length === 0) warnings.push("File tidak berisi transaksi.");

  return { ok: true, data, preview: previewOf(data), warnings };
}

export function parseImportJson(text: string): ImportValidation {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "Isi file bukan JSON yang valid.", issues: [] };
  }
  return validateImportPayload(json);
}

export const emptyDataset = createEmptyData;

export type { ExportMeta };
