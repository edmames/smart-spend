"use client";

import { create } from "zustand";
import {
  applyArchiveSavingsTarget,
  applyArchiveWallet,
  applyCreateBudget,
  applyCreateSavingsTarget,
  applyCreateTransaction,
  applyCreateWallet,
  applyDeleteBudget,
  applyDeleteTransaction,
  applyDeleteWallet,
  applyRestoreSavingsTarget,
  applyRestoreWallet,
  applyReset,
  applyUpdateBudget,
  applyUpdateSavingsTarget,
  applyUpdateTransaction,
  applyUpdateWallet,
  type AppData,
  type CreateSavingsTargetInput,
  type CreateTransactionBase,
  type CreateWalletInput,
  type UpdateWalletInput,
} from "@/app/actions";
import { createId } from "@/domain/id";
import {
  DEFAULT_SETTINGS,
  type Budget,
  type NewBudget,
  type NewSavingsTarget,
  type SavingsTarget,
  type TransactionType,
  type Wallet,
} from "@/domain/models";
import { createLocalStorageRepository, type SmartSpendRepository } from "@/repository/repository";
import { mutationError, type HydrationStatus, type MutationResult } from "@/types";
import { validateImportPayload } from "@/app/backup";
import type { PersistedData } from "@/repository/storage-schema";
import { pushToast } from "@/app/toast";

/**
 * SmartSpend — application store.
 *
 * Responsibilities (and nothing more):
 *  - hold the *dataset* (wallets / transactions / savings / budgets / settings),
 *  - delegate every change to the pure actions in `src/app/actions.ts`,
 *  - write through the repository after a successful change,
 *  - expose hydration + storage failure state to the UI.
 *
 * There is deliberately **no balance state** here. Balances are always derived
 * (see `src/app/derived.ts`), so a mutation can never leave a stale total behind.
 */

export interface StorageFailure {
  message: string;
  issues: string[];
  raw: string | null;
  backupKey?: string;
}

interface SmartSpendStore {
  data: AppData;
  hydration: HydrationStatus;
  storageFailure: StorageFailure | null;
  lastSavedAt: string | null;
  hydrate: () => Promise<void>;
  reload: () => Promise<void>;
  resetStore: (data?: AppData) => void;

  createWallet: (input: Omit<CreateWalletInput, "id"> & { id?: string }) => MutationResult<Wallet | undefined>;
  updateWallet: (input: UpdateWalletInput) => MutationResult<Wallet | undefined>;
  archiveWallet: (id: string) => MutationResult<Wallet | undefined>;
  restoreWallet: (id: string) => MutationResult<Wallet | undefined>;
  deleteWallet: (id: string) => MutationResult<AppData>;

  createTransaction: (
    input: CreateTransactionBase & { type: TransactionType },
  ) => MutationResult<AppData>;
  updateTransaction: (
    id: string,
    input: CreateTransactionBase & { type: TransactionType },
  ) => MutationResult<AppData>;
  deleteTransaction: (id: string) => MutationResult<AppData>;

  createSavingsTarget: (input: Omit<CreateSavingsTargetInput, "id"> & { id?: string }) => MutationResult<SavingsTarget | undefined>;
  updateSavingsTarget: (
    id: string,
    patch: Partial<Pick<SavingsTarget, "name" | "targetAmount" | "deadline" | "note">>,
  ) => MutationResult<SavingsTarget | undefined>;
  archiveSavingsTarget: (id: string) => MutationResult<SavingsTarget | undefined>;
  restoreSavingsTarget: (id: string) => MutationResult<SavingsTarget | undefined>;

  createBudget: (input: Omit<Budget, "id" | "createdAt" | "updatedAt"> & { id?: string }) => MutationResult<Budget | undefined>;
  updateBudget: (
    id: string,
    patch: Partial<Pick<Budget, "categoryId" | "month" | "limitAmount">>,
  ) => MutationResult<Budget | undefined>;
  deleteBudget: (id: string) => MutationResult<Budget | undefined>;

  importDataset: (raw: unknown) => MutationResult<AppData>;
  resetAllData: () => MutationResult<void>;
}

let activeRepository: SmartSpendRepository | null = null;

/** Injectable so tests can swap in an in-memory adapter without touching the app. */
export function configureRepository(repository: SmartSpendRepository | null): void {
  activeRepository = repository;
}

function repository(): SmartSpendRepository {
  if (!activeRepository) activeRepository = createLocalStorageRepository();
  return activeRepository;
}

const EMPTY: AppData = {
  version: 2,
  wallets: [],
  transactions: [],
  savingsTargets: [],
  budgets: [],
  settings: DEFAULT_SETTINGS,
};

type ApplyAndSave = (data: AppData) => MutationResult<AppData>;

export const useSmartSpendStore = create<SmartSpendStore>()((set, get) => {
  const commit = (apply: ApplyAndSave): MutationResult<AppData> => {
    const result = apply(get().data);
    if (!result.ok) {
      pushToast(result.error.message, "error");
      return result;
    }
    const data = result.value;
    const persisted = { ...data, settings: data.settings ?? DEFAULT_SETTINGS };
    const saved = repository().save(persisted);
    if (!saved.ok) {
      set({
        data: persisted,
        storageFailure: {
          message: saved.failure?.message ?? "Gagal menyimpan.",
          issues: saved.failure?.issues ?? [],
          raw: null,
        },
      });
      pushToast("Perubahan disimpan di memori tapi gagal ditulis ke penyimpanan.", "error");
      return { ok: true, value: persisted };
    }
    set({
      data: persisted,
      storageFailure: null,
      lastSavedAt: new Date().toISOString(),
      hydration: "ready",
    });
    return { ok: true, value: persisted };
  };

  const findWallet = (id: string): MutationResult<Wallet | undefined> => {
    const wallet = get().data.wallets.find((candidate) => candidate.id === id);
    return wallet ? { ok: true, value: wallet } : mutationError("NOT_FOUND", "Dompet tidak ditemukan.");
  };

  return {
    data: EMPTY,
    hydration: "idle",
    storageFailure: null,
    lastSavedAt: null,

    async hydrate() {
      if (get().hydration === "ready" || get().hydration === "loading") return;
      set({ hydration: "loading" });
      const result = repository().load();
      if (result.ok && result.value) {
        set({
          data: { ...result.value, settings: result.value.settings ?? DEFAULT_SETTINGS },
          hydration: "ready",
          storageFailure: null,
        });
        return;
      }
      set({
        hydration: "error",
        storageFailure: {
          message: result.failure?.message ?? "Data tersimpan tidak terbaca.",
          issues: result.failure?.issues ?? [],
          raw: result.failure?.raw ?? repository().peekRaw(),
          backupKey: result.failure?.backupKey,
        },
      });
    },

    async reload() {
      set({ hydration: "loading" });
      const result = repository().load();
      if (result.ok && result.value) {
        set({ data: { ...result.value, settings: result.value.settings ?? DEFAULT_SETTINGS }, hydration: "ready", storageFailure: null });
      }
    },

    resetStore(data: AppData = EMPTY) {
      set({ data: { ...data, settings: data.settings ?? DEFAULT_SETTINGS }, hydration: "idle", storageFailure: null, lastSavedAt: null });
    },

    /* ------------------------------- wallets ------------------------------- */
    createWallet(input) {
      const id = input.id ?? createId();
      const result = commit((data) => applyCreateWallet(data, { ...input, id }));
      if (!result.ok) return result;
      pushToast(`Dompet "${input.name}" dibuat.`, "success");
      return findWallet(id);
    },

    updateWallet(input) {
      const result = commit((data) => applyUpdateWallet(data, input));
      if (!result.ok) return result;
      pushToast("Dompet diperbarui.", "success");
      return findWallet(input.id);
    },

    archiveWallet(id) {
      const result = commit((data) => applyArchiveWallet(data, id));
      if (!result.ok) return result;
      pushToast("Dompet diarsipkan. Riwayat transaksinya tetap dihitung.", "success");
      return findWallet(id);
    },

    restoreWallet(id) {
      const result = commit((data) => applyRestoreWallet(data, id));
      if (!result.ok) return result;
      pushToast("Dompet dipulihkan.", "success");
      return findWallet(id);
    },

    deleteWallet(id) {
      return commit((data) => applyDeleteWallet(data, id));
    },

    /* ---------------------------- transactions ---------------------------- */
    createTransaction(input) {
      const result = commit((data) => applyCreateTransaction(data, input)) as MutationResult<AppData>;
      if (!result.ok) return result;
      pushToast("Transaksi tersimpan.", "success");
      return result;
    },

    updateTransaction(id, input) {
      const result = commit((data) => applyUpdateTransaction(data, id, input));
      if (!result.ok) return result;
      pushToast("Transaksi diperbarui, semua saldo dihitung ulang.", "success");
      return result;
    },

    deleteTransaction(id) {
      const result = commit((data) => applyDeleteTransaction(data, id));
      if (!result.ok) return result;
      pushToast("Transaksi dihapus, saldo dihitung ulang.", "success");
      return result;
    },

    /* ------------------------------- savings ------------------------------- */
    createSavingsTarget(input) {
      const id = input.id ?? createId();
      const payload: NewSavingsTarget = { ...input, id } as NewSavingsTarget;
      const result = commit((data) => applyCreateSavingsTarget(data, payload));
      if (!result.ok) return result;
      pushToast(`Target "${input.name}" dibuat.`, "success");
      return findTarget(get, id);
    },

    updateSavingsTarget(id, patch) {
      const result = commit((data) => applyUpdateSavingsTarget(data, id, patch));
      if (!result.ok) return result;
      pushToast("Target tabungan diperbarui.", "success");
      return findTarget(get, id);
    },

    archiveSavingsTarget(id) {
      const result = commit((data) => applyArchiveSavingsTarget(data, id));
      if (!result.ok) return result;
      pushToast("Target diarsipkan.", "success");
      return findTarget(get, id);
    },

    restoreSavingsTarget(id) {
      const result = commit((data) => applyRestoreSavingsTarget(data, id));
      if (!result.ok) return result;
      pushToast("Target dipulihkan.", "success");
      return findTarget(get, id);
    },

    /* -------------------------------- budgets ------------------------------ */
    createBudget(input) {
      const id = input.id ?? createId();
      const payload: NewBudget = { ...input, id } as NewBudget;
      const result = commit((data) => applyCreateBudget(data, payload));
      if (!result.ok) return result;
      pushToast("Budget dibuat.", "success");
      return findBudget(get, id);
    },

    updateBudget(id, patch) {
      const result = commit((data) => applyUpdateBudget(data, id, patch));
      if (!result.ok) return result;
      pushToast("Budget diperbarui.", "success");
      return findBudget(get, id);
    },

    deleteBudget(id) {
      const result = commit((data) => applyDeleteBudget(data, id));
      if (!result.ok) return result;
      pushToast("Budget dihapus.", "success");
      return findBudget(get, id);
    },

    /* -------------------------- data management --------------------------- */
    importDataset(raw) {
      const validation = validateImportPayload(raw);
      if (!validation.ok) {
        pushToast(validation.message, "error");
        return { ok: false, error: { code: "IMPORT_INVALID", message: validation.message } };
      }
      const result = commit(() => ({ ok: true, value: validation.data }));
      if (!result.ok) return result;
      pushToast(
        `Impor selesai: ${validation.data.wallets.length} dompet, ${validation.data.transactions.length} transaksi.`,
        "success",
      );
      return result;
    },

    resetAllData() {
      const cleared = repository().clear();
      const data: PersistedData = applyReset();
      set({ data: { ...data, settings: DEFAULT_SETTINGS }, storageFailure: null, lastSavedAt: null, hydration: "ready" });
      if (!cleared.ok) {
        pushToast(cleared.failure?.message ?? "Data dibersihkan dari memori, tapi penyimpanan gagal dihapus.", "error");
      } else {
        pushToast("Semua data di perangkat ini sudah dihapus.", "success");
      }
      return { ok: true, value: undefined };
    },
  };
});

function findTarget(
  get: () => SmartSpendStore,
  id: string,
): MutationResult<SavingsTarget | undefined> {
  const target = get().data.savingsTargets.find((candidate) => candidate.id === id);
  return target ? { ok: true, value: target } : mutationError("NOT_FOUND", "Target tabungan tidak ditemukan.");
}

function findBudget(get: () => SmartSpendStore, id: string): MutationResult<Budget | undefined> {
  const budget = get().data.budgets.find((candidate) => candidate.id === id);
  return budget ? { ok: true, value: budget } : mutationError("NOT_FOUND", "Budget tidak ditemukan.");
}

/** `createBudget` needs the created record even when the caller did not pass an id. */
export function useStoreData(): AppData {
  return useSmartSpendStore((state) => state.data);
}
