import { describe, expect, it } from "vitest";
import {
  MAX_CORRUPT_BACKUPS,
  STORAGE_KEY,
  createEmptyData,
  type PersistedData,
} from "@/repository/storage-schema";
import { CORRUPT_BACKUP_PREFIX } from "@/repository/storage-schema";
import { createLocalStorageRepository, dataIntegrityChecks } from "@/repository/repository";
import { LocalStorageAdapter, MemoryStorageAdapter, StorageWriteError, type KeyValueStore } from "@/repository/storage";
import { STORAGE_VERSION } from "@/repository/storage-schema";
import { at, emptyData, makeTx, makeWallet, on } from "../fixtures";

/**
 * Spec §30–§33 — the repository abstraction.
 * These tests use the in-memory adapter: the *only* thing that changes for a
 * Supabase implementation is the adapter, which is exactly the point.
 */

function repo(initial: Record<string, string> = {}) {
  const adapter = new MemoryStorageAdapter(initial);
  return { repository: createLocalStorageRepository(adapter), adapter };
}

describe("first run", () => {
  it("loads an empty dataset instead of failing", () => {
    const { repository } = repo();
    const result = repository.load();
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(createEmptyData());
    expect(result.migrated).toBeFalsy();
  });

  it("treats an empty string as no data", () => {
    const { repository } = repo({ [STORAGE_KEY]: "" });
    expect(repository.load().ok).toBe(true);
    expect(repository.load().value?.wallets).toEqual([]);
  });
});

describe("save / load round trip", () => {
  it("stores and returns the same dataset", () => {
    const { repository, adapter } = repo();
    const data: PersistedData = emptyData({
      wallets: [makeWallet("w1", { name: "BCA" })],
      transactions: [
        makeTx({ id: "t1", type: "opening_balance", amount: 1_000_000, destinationWalletId: "w1", date: on(2026, 8, 1) }),
        makeTx({
          id: "t2",
          type: "expense",
          amount: 125_000,
          sourceWalletId: "w1",
          categoryId: "makanan",
          date: on(2026, 8, 2),
        }),
      ],
    });
    expect(repository.save(data).ok).toBe(true);
    const loaded = repository.load();
    expect(loaded.ok).toBe(true);
    expect(loaded.value?.transactions.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(loaded.value?.wallets[0]?.name).toBe("BCA");
    // what sits in the browser is plain JSON under one versioned key
    const raw = adapter.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ version: STORAGE_VERSION });
  });

  it("refuses to write data that does not match the schema (no partial state)", () => {
    const { repository, adapter } = repo();
    const bad = {
      ...emptyData(),
      wallets: [{ ...makeWallet("w1"), balance: 500_000 } as never],
    } as unknown as PersistedData;
    const result = repository.save(bad);
    expect(result.ok).toBe(false);
    expect(result.failure?.issues.length).toBeGreaterThan(0);
    expect(adapter.getItem(STORAGE_KEY)).toBeNull();
  });

  it("surfaces a quota failure as a typed error", () => {
    const failing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new StorageWriteError("Penyimpanan browser penuh, data terbaru gagal disimpan.");
      },
      removeItem: () => {},
      keys: () => [],
    };
    const result = createLocalStorageRepository(failing).save(emptyData());
    expect(result.ok).toBe(false);
    expect(result.failure?.message).toMatch(/penuh/i);
  });

  it("reports unavailable storage instead of throwing", () => {
    const repository = createLocalStorageRepository(new LocalStorageAdapter(null));
    expect(repository.isAvailable()).toBe(false);
    const loaded = repository.load();
    expect(loaded.ok).toBe(false);
    expect(loaded.failure?.reason).toBe("unavailable");
  });
});

describe("corruption handling", () => {
  it("keeps the damaged payload recoverable and tells the user why", () => {
    const raw = '{"version":1,"wallets":[{"id":"w1"}],"transactions":[]}';
    const { repository, adapter } = repo({ [STORAGE_KEY]: raw });
    const result = repository.load();
    expect(result.ok).toBe(false);
    expect(result.failure?.reason).toBe("corrupt");
    expect(result.failure?.raw).toBe(raw);
    expect(result.failure?.issues.length).toBeGreaterThan(0);
    // original bytes moved aside, not overwritten
    expect(result.failure?.backupKey).toBeTruthy();
    expect(adapter.getItem(result.failure?.backupKey ?? "")).toBe(raw);
  });

  it("never destroys data on read: the corrupt payload stays retrievable", () => {
    const raw = "this is not json";
    const { repository } = repo({ [STORAGE_KEY]: raw });
    expect(repository.load().ok).toBe(false);
    expect(repository.peekRaw()).toBe(raw);
  });

  it("keeps at most MAX_CORRUPT_BACKUPS backups", () => {
    const { adapter } = repo({ [STORAGE_KEY]: "broken" });
    const repository = createLocalStorageRepository(adapter);
    // Backup keys are timestamp based, so advance the clock one second per attempt
    // to make sure the housekeeping logic really prunes instead of overwriting.
    const realNow = Date.now;
    let tick = 0;
    Date.now = () => realNow() + (tick += 1) * 1000;
    try {
      for (let index = 0; index < MAX_CORRUPT_BACKUPS + 3; index += 1) {
        adapter.setItem(STORAGE_KEY, `broken-${index}`);
        expect(repository.load().ok).toBe(false);
      }
    } finally {
      Date.now = realNow;
    }
    expect(adapter.keys(CORRUPT_BACKUP_PREFIX)).toHaveLength(MAX_CORRUPT_BACKUPS);
    // the newest one survives
    expect(adapter.getItem(adapter.keys(CORRUPT_BACKUP_PREFIX).sort().at(-1) ?? "")).toBe(
      `broken-${MAX_CORRUPT_BACKUPS + 2}`,
    );
  });

  it("rejects a payload that parses but breaks the financial invariants", () => {
    const data = emptyData({
      wallets: [makeWallet("w1", { name: "Cash", type: "cash" })],
      transactions: [
        makeTx({
          id: "t1",
          type: "expense",
          amount: 500_000,
          sourceWalletId: "w1",
          categoryId: "makanan",
          date: on(2026, 8, 1),
        }),
      ],
    });
    const problems = dataIntegrityChecks[0]!(data as never);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toMatch(/saldo|negatif|dompet/i);
  });

  it("migrates a v0 payload on read", () => {
    const { repository } = repo({
      [STORAGE_KEY]: JSON.stringify({
        wallets: [{ id: "w1", name: "Cash", type: "cash", provider: null, createdAt: at(2026, 1, 1), updatedAt: at(2026, 1, 1), archivedAt: null }],
        transactions: [],
        savingsTargets: [],
        budgets: [],
      }),
    });
    const result = repository.load();
    expect(result.ok).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.value?.wallets[0]?.name).toBe("Cash");
  });
});

describe("clear", () => {
  it("removes the dataset and the corrupt backups", () => {
    const { repository, adapter } = repo({ [STORAGE_KEY]: "broken", [`${CORRUPT_BACKUP_PREFIX}1`]: "x" });
    expect(repository.clear().ok).toBe(true);
    expect(adapter.getItem(STORAGE_KEY)).toBeNull();
    expect(adapter.keys(CORRUPT_BACKUP_PREFIX)).toEqual([]);
    expect(repository.load().ok).toBe(true);
  });
});
