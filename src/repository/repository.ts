import { ledgerInvariants, validateLedgerChronology } from "@/domain/validation";
import {
  CORRUPT_BACKUP_PREFIX,
  STORAGE_KEY,
  MAX_CORRUPT_BACKUPS,
  createEmptyData,
  parsePersistedJson,
  persistedDataSchema,
  serializePersistedData,
  type PersistedData,
  type ParseResult,
} from "@/repository/storage-schema";
import { StorageWriteError, type KeyValueStore, LocalStorageAdapter } from "@/repository/storage";

/**
 * SmartSpend — repository boundary.
 *
 *   UI  ->  store/actions (src/app)  ->  domain (pure finance)  ->  THIS  ->  localStorage
 *
 * Phase 3 replaces `createLocalStorageRepository()` with a Supabase repository
 * implementing the same interface; no financial rule, selector or form changes.
 */

export interface LoadFailure {
  reason: "corrupt" | "unavailable" | "unsupported_version";
  message: string;
  issues: string[];
  /** Raw payload preserved so the user can download it instead of losing it. */
  raw?: string;
  backupKey?: string;
}

export interface RepositoryResult<T> {
  ok: boolean;
  value?: T;
  failure?: LoadFailure;
  /** True when data had to be migrated before it could be read. */
  migrated?: boolean;
}

export interface SmartSpendRepository {
  /** Human readable name, surfaced in Settings so the storage backend is never a mystery. */
  readonly label: string;
  isAvailable(): boolean;
  load(): RepositoryResult<PersistedData>;
  save(data: PersistedData): RepositoryResult<void>;
  clear(): RepositoryResult<void>;
  /** Raw JSON currently stored (used by "download corrupt data"). */
  peekRaw(): string | null;
}

/** Cross-entity consistency rules applied on every read. */
export const dataIntegrityChecks = [
  (data: PersistedData): string[] => {
    const structural = ledgerInvariants({
      wallets: data.wallets,
      transactions: data.transactions,
      savingsTargets: data.savingsTargets,
      budgets: data.budgets,
    });
    const messages = structural.map((error) => error.message);

    const chronology = validateLedgerChronology(data.transactions, {
      wallets: data.wallets,
      savingsTargets: data.savingsTargets,
    });
    if (!chronology.valid) {
      messages.push(chronology.error?.message ?? "Riwayat saldo menghasilkan saldo negatif.");
    }
    return messages;
  },
];

export function createLocalStorageRepository(adapter: KeyValueStore = new LocalStorageAdapter()): SmartSpendRepository {
  const writable = adapter as Partial<LocalStorageAdapter>;
  const availability = () => (typeof writable.available === "boolean" ? writable.available : true);

  const backupCorrupt = (raw: string): string | undefined => {
    if (!raw) return undefined;
    try {
      const key = `${CORRUPT_BACKUP_PREFIX}${Date.now()}`;
      adapter.setItem(key, raw);
      // Keep only the newest MAX_CORRUPT_BACKUPS; drop the oldest first.
      const stale = adapter.keys(CORRUPT_BACKUP_PREFIX).sort();
      for (const old of stale.slice(0, Math.max(0, stale.length - MAX_CORRUPT_BACKUPS))) {
        adapter.removeItem(old);
      }
      return key;
    } catch {
      return undefined;
    }
  };

  return {
    label: "localStorage (perangkat ini)",
    isAvailable: availability,

    load(): RepositoryResult<PersistedData> {
      if (!availability()) {
        return {
          ok: false,
          failure: {
            reason: "unavailable",
            message: "Penyimpanan browser tidak tersedia di mode ini (private browsing / cookies diblokir).",
            issues: [],
          },
        };
      }

      const raw = adapter.getItem(STORAGE_KEY);
      if (raw === null || raw.length === 0) {
        // First run: an empty, valid dataset. Not an error.
        return { ok: true, value: createEmptyData() };
      }

      const parsed: ParseResult = parsePersistedJson(raw, dataIntegrityChecks);
      if (!parsed.ok) {
        const backupKey = backupCorrupt(raw);
        return {
          ok: false,
          failure: {
            reason: parsed.failure.needsNewerApp ? "unsupported_version" : "corrupt",
            message: parsed.failure.message,
            issues: parsed.failure.issues,
            raw,
            backupKey,
          },
        };
      }

      return {
        ok: true,
        value: parsed.data,
        migrated: parsed.migrations.length > 0,
      };
    },

    save(data: PersistedData): RepositoryResult<void> {
      const validated = persistedDataSchema.safeParse(data);
      if (!validated.success) {
        return {
          ok: false,
          failure: {
            reason: "corrupt",
            message: "Data ditolak sebelum disimpan karena tidak sesuai skema.",
            issues: validated.error.issues
              .slice(0, 8)
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
          },
        };
      }
      try {
        adapter.setItem(STORAGE_KEY, JSON.stringify(validated.data));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          failure: {
            reason: "unavailable",
            message:
              error instanceof StorageWriteError
                ? error.message
                : "Gagal menyimpan data ke penyimpanan browser.",
            issues: [],
          },
        };
      }
    },

    clear(): RepositoryResult<void> {
      try {
        adapter.removeItem(STORAGE_KEY);
        for (const key of adapter.keys(CORRUPT_BACKUP_PREFIX)) adapter.removeItem(key);
        return { ok: true };
      } catch {
        return {
          ok: false,
          failure: { reason: "unavailable", message: "Gagal menghapus data penyimpanan.", issues: [] },
        };
      }
    },

    peekRaw(): string | null {
      return adapter.getItem(STORAGE_KEY);
    },
  };
}

/** Export payload builder lives here so the *shape* of persisted data stays owned by the repository layer. */
export const buildExportPayload = (data: PersistedData, exportedAt = new Date().toISOString()) =>
  serializePersistedData(data, exportedAt);
