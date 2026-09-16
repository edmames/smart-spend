import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureRepository,
  useSmartSpendStore,
} from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { STORAGE_KEY } from "@/repository/storage-schema";
import { buildExportPayload } from "@/app/backup";
import { at, emptyData, makeTx, makeWallet } from "../fixtures";

/**
 * Spec §30–§33 + §63–§66 — the store is the only bridge between UI and the
 * repository, and it must never persist derived numbers.
 */

let adapter: MemoryStorageAdapter;

function freshStore(initial: Record<string, string> = {}) {
  adapter = new MemoryStorageAdapter(initial);
  configureRepository(createLocalStorageRepository(adapter));
  useSmartSpendStore.getState().resetStore(emptyData());
  return useSmartSpendStore.getState();
}

beforeEach(() => {
  freshStore();
});

afterEach(() => {
  configureRepository(null);
});

describe("hydration", () => {
  it("starts empty (no demo data) and becomes ready", async () => {
    await useSmartSpendStore.getState().hydrate();
    const state = useSmartSpendStore.getState();
    expect(state.hydration).toBe("ready");
    expect(state.data.wallets).toEqual([]);
    expect(state.data.transactions).toEqual([]);
    expect(state.data.savingsTargets).toEqual([]);
    expect(state.data.budgets).toEqual([]);
    expect(state.storageFailure).toBeNull();
  });

  it("loads a stored dataset from the repository", async () => {
    const stored = emptyData({ wallets: [makeWallet("w1", { name: "BCA" })] });
    adapter.setItem(STORAGE_KEY, JSON.stringify(stored));
    useSmartSpendStore.getState().resetStore();
    await useSmartSpendStore.getState().hydrate();
    expect(useSmartSpendStore.getState().data.wallets.map((w) => w.name)).toEqual(["BCA"]);
  });

  it("surfaces corrupt storage as a recovery state, keeping the raw payload", async () => {
    freshStore({ [STORAGE_KEY]: "{ broken json" });
    await useSmartSpendStore.getState().hydrate();
    const state = useSmartSpendStore.getState();
    expect(state.hydration).toBe("error");
    expect(state.storageFailure?.message).toMatch(/JSON/i);
    expect(state.storageFailure?.raw).toBe("{ broken json");
    // the store refuses to work with unknown data rather than guessing
    expect(state.data.wallets).toEqual([]);
  });

  it("does not hydrate twice", async () => {
    let loads = 0;
    const counting = {
      ...createLocalStorageRepository(adapter),
      load() {
        loads += 1;
        return createLocalStorageRepository(adapter).load();
      },
    };
    configureRepository(counting);
    await useSmartSpendStore.getState().hydrate();
    await useSmartSpendStore.getState().hydrate();
    expect(loads).toBe(1);
  });
});

describe("write-through persistence", () => {
  it("every successful mutation is written to the repository immediately", async () => {
    await useSmartSpendStore.getState().hydrate();
    const wallet = useSmartSpendStore.getState().createWallet({ name: "BCA", type: "bank", openingBalance: 250_000 });
    expect(wallet.ok).toBe(true);

    const raw = adapter.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw ?? "{}") as { wallets: unknown[]; transactions: unknown[] };
    expect(persisted.wallets).toHaveLength(1);
    // the opening balance is a ledger record, not a field on the wallet
    expect(persisted.transactions).toHaveLength(1);
    expect(JSON.stringify(persisted.wallets)).not.toMatch(/"balance"/);
    expect(useSmartSpendStore.getState().lastSavedAt).toBeTruthy();
  });

  it("a rejected mutation changes nothing, in memory or on disk", async () => {
    await useSmartSpendStore.getState().hydrate();
    useSmartSpendStore.getState().createWallet({ name: "Cash", type: "cash", openingBalance: 10_000 });
    const before = adapter.getItem(STORAGE_KEY);
    const transactionsBefore = useSmartSpendStore.getState().data.transactions.length;
    expect(transactionsBefore).toBe(1); // the cash wallet's opening balance

    const rejected = useSmartSpendStore.getState().createTransaction({
      type: "expense",
      amount: 999_999,
      date: at(2026, 8, 1),
      sourceWalletId: "does-not-exist",
      categoryId: "makanan",
    });
    expect(rejected.ok).toBe(false);
    expect(adapter.getItem(STORAGE_KEY)).toBe(before);
    expect(useSmartSpendStore.getState().data.transactions).toHaveLength(transactionsBefore);
  });

  it("keeps working in memory when the write fails, and says so", async () => {
    await useSmartSpendStore.getState().hydrate();
    const failing = createLocalStorageRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      keys: () => [],
    });
    configureRepository(failing);
    const result = useSmartSpendStore.getState().createWallet({ name: "BCA", type: "bank", openingBalance: 1000 });
    expect(result.ok).toBe(true);
    const state = useSmartSpendStore.getState();
    expect(state.storageFailure?.message).toMatch(/menyimpan/i);
    expect(state.data.wallets).toHaveLength(1);
  });
});

describe("derived numbers are never stored", () => {
  it("the persisted payload has no balance fields anywhere", async () => {
    await useSmartSpendStore.getState().hydrate();
    const store = useSmartSpendStore.getState();
    const wallet = store.createWallet({ name: "BCA", type: "bank", openingBalance: 1_000_000 });
    if (!wallet.ok) throw new Error("wallet creation failed");
    const id = wallet.value!.id;
    store.createTransaction({ type: "expense", amount: 100_000, date: at(2026, 8, 1), sourceWalletId: id, categoryId: "makanan" });
    store.createSavingsTarget({ name: "Dana Darurat", targetAmount: 5_000_000 });
    const targetId = useSmartSpendStore.getState().data.savingsTargets[0]!.id;
    store.createTransaction({ type: "savings_deposit", amount: 200_000, date: at(2026, 8, 2), sourceWalletId: id, savingsTargetId: targetId });

    const raw = JSON.parse(adapter.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(JSON.stringify(raw)).not.toMatch(/"(balance|saved|savedAmount|currentAmount|totalMoney)"/);
    expect(JSON.parse(JSON.stringify(buildExportPayload(useSmartSpendStore.getState().data)))).toBeTruthy();
  });
});

describe("archive instead of destructive delete", () => {
  it("a wallet with history cannot be deleted but can be archived", async () => {
    await useSmartSpendStore.getState().hydrate();
    const store = useSmartSpendStore.getState();
    const created = store.createWallet({ name: "BCA", type: "bank", openingBalance: 100_000 });
    if (!created.ok) throw new Error("failed");
    const id = created.value!.id;

    expect(store.deleteWallet(id).ok).toBe(false);

    const archived = useSmartSpendStore.getState().archiveWallet(id);
    expect(archived.ok).toBe(true);
    expect(useSmartSpendStore.getState().data.wallets).toHaveLength(1);
    expect(useSmartSpendStore.getState().data.wallets[0]?.archivedAt).toBeTruthy();
    // history survives archiving
    expect(useSmartSpendStore.getState().data.transactions.some((t) => t.type === "opening_balance")).toBe(true);

    // an empty wallet can still be deleted for real
    const spare = useSmartSpendStore.getState().createWallet({ name: "Saldo nol", type: "cash", openingBalance: 0 });
    if (spare.ok) {
      expect(useSmartSpendStore.getState().deleteWallet(spare.value!.id).ok).toBe(true);
      expect(useSmartSpendStore.getState().data.wallets.map((w) => w.name)).toEqual(["BCA"]);
    }
  });

  it("an archived wallet disappears from new-transaction validation", async () => {
    await useSmartSpendStore.getState().hydrate();
    const created = useSmartSpendStore.getState().createWallet({ name: "Lama", type: "cash", openingBalance: 50_000 });
    if (!created.ok) throw new Error("failed");
    const id = created.value!.id;
    useSmartSpendStore.getState().archiveWallet(id);
    const result = useSmartSpendStore.getState().createTransaction({
      type: "expense",
      amount: 1_000,
      date: at(2026, 8, 1),
      sourceWalletId: id,
      categoryId: "makanan",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/arsip/i);
  });
});

describe("import & reset", () => {
  it("import replaces the dataset and persists it", async () => {
    await useSmartSpendStore.getState().hydrate();
    useSmartSpendStore.getState().createWallet({ name: "Lama", type: "cash", openingBalance: 1 });

    const payload = {
      ...emptyData(),
      wallets: [makeWallet("w-new", { name: "Baru" })],
      transactions: [makeTx({ id: "t-new", type: "opening_balance", amount: 40_000, destinationWalletId: "w-new" })],
    };
    const result = useSmartSpendStore.getState().importDataset(payload);
    expect(result.ok).toBe(true);

    const state = useSmartSpendStore.getState();
    expect(state.data.wallets.map((w) => w.name)).toEqual(["Baru"]);
    expect(state.data.transactions).toHaveLength(1);
    expect(JSON.parse(adapter.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({ wallets: payload.wallets });
  });

  it("an invalid import is refused as a whole, leaving the app untouched", async () => {
    await useSmartSpendStore.getState().hydrate();
    useSmartSpendStore.getState().createWallet({ name: "Ada", type: "cash", openingBalance: 5_000 });
    const before = JSON.stringify(useSmartSpendStore.getState().data);

    const result = useSmartSpendStore.getState().importDataset({
      version: 1,
      wallets: [{ id: "w1", name: "X", type: "cash", balance: 999_999 }],
      transactions: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("IMPORT_INVALID");
    expect(JSON.stringify(useSmartSpendStore.getState().data)).toBe(before);
  });

  it("reset clears memory and storage", async () => {
    freshStore({
      [STORAGE_KEY]: JSON.stringify(
        emptyData({
          wallets: [makeWallet("w1")],
          transactions: [makeTx({ id: "t1", type: "opening_balance", amount: 1000, destinationWalletId: "w1" })],
        }),
      ),
    });
    await useSmartSpendStore.getState().hydrate();
    expect(useSmartSpendStore.getState().data.wallets).toHaveLength(1);

    expect(useSmartSpendStore.getState().resetAllData().ok).toBe(true);
    const state = useSmartSpendStore.getState();
    expect(state.data).toEqual(expect.objectContaining({ wallets: [], transactions: [], budgets: [], savingsTargets: [] }));
    expect(adapter.getItem(STORAGE_KEY)).toBeNull();
    expect(state.lastSavedAt).toBeNull();
  });
});
