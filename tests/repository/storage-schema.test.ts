import { describe, expect, it } from "vitest";
import { ALL_CATEGORIES, getCategoryMeta } from "@/domain/categories";
import {
  CORRUPT_BACKUP_PREFIX,
  EMPTY_DATA,
  STORAGE_KEY,
  STORAGE_VERSION,
  createEmptyData,
  migratePayload,
  parsePersistedData,
  parsePersistedJson,
  persistedDataSchema,
  seedDefaultCategories,
  serializePersistedData,
} from "@/repository/storage-schema";
import { at, emptyData, makeBudget, makeTarget, makeTx, makeWallet, on } from "../fixtures";

/**
 * Spec §24–§33 — the versioned, Zod-validated persistence envelope.
 * Nothing stored is ever trusted: bad JSON must be *reported*, not repaired.
 */

describe("persistedDataSchema (stored shape)", () => {
  it("accepts the documented envelope", () => {
    const payload = {
      version: STORAGE_VERSION,
      wallets: [makeWallet("w1")],
      transactions: [
        makeTx({ id: "t1", type: "expense", amount: 1000, sourceWalletId: "w1", categoryId: "makanan" }),
      ],
      savingsTargets: [makeTarget("s1")],
      budgets: [makeBudget("makanan", "2026-08", 1000000)],
      categories: seedDefaultCategories(),
      settings: { currency: "IDR" },
    };
    expect(persistedDataSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an unknown version", () => {
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, version: STORAGE_VERSION + 1 }).success).toBe(false);
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, version: STORAGE_VERSION - 1 }).success).toBe(false);
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, version: "1" }).success).toBe(false);
  });

  it("rejects unknown top level keys (strict objects)", () => {
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, demo: true }).success).toBe(false);
  });

  it("rejects a wallet carrying a mutable balance field", () => {
    const wallet = { ...makeWallet("w1"), balance: 500000 } as never;
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, wallets: [wallet] }).success).toBe(false);
  });

  it("rejects non-integer, zero and negative money", () => {
    for (const amount of [0, -1, 12.5, 10_000_000_000, Number.MAX_SAFE_INTEGER + 2]) {
      const transaction = makeTx({ id: "t1", type: "expense", amount, sourceWalletId: "w1" });
      expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, transactions: [transaction] }).success).toBe(false);
    }
  });

  it("rejects a transaction type that is not one of the six canonical ones", () => {
    const transaction = { ...makeTx({ id: "t1" }), type: "refund" } as never;
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, transactions: [transaction] }).success).toBe(false);
  });

  it("rejects a transaction date that is not a YYYY-MM-DD calendar day", () => {
    // Otherwise valid record: only the date varies, so the schema is really
    // being tested on the date format and never on another field.
    const valid = makeTx({ id: "t1", type: "opening_balance", destinationWalletId: "w1", date: on(2026, 8, 1) });
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, transactions: [valid] }).success).toBe(true);

    for (const date of ["15/08/2026", "2026-02-30", "2026-8-1", at(2026, 8, 1)]) {
      expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, transactions: [{ ...valid, date }] }).success).toBe(false);
    }
  });
});

describe("createEmptyData", () => {
  it("starts completely empty (no demo data) and is not shared state", () => {
    const first = createEmptyData();
    expect(first).toEqual({
      version: STORAGE_VERSION,
      wallets: [],
      transactions: [],
      savingsTargets: [],
      budgets: [],
      categories: seedDefaultCategories(),
      settings: null,
    });
    first.wallets.push(makeWallet("w1"));
    expect(createEmptyData().wallets).toHaveLength(0);
  });
});

describe("migratePayload", () => {
  it("wraps a version-less (v0) payload that looks like our shape", () => {
    const result = migratePayload({ wallets: [], transactions: [] });
    expect(result).not.toBeNull();
    expect(result?.payload.version).toBe(STORAGE_VERSION);
    expect(result?.applied.map((migration) => migration.to)).toEqual([1, 2, STORAGE_VERSION]);
  });

  it("converts v1 transaction instants into Asia/Jakarta calendar days (v1 -> v2)", () => {
    // 2026-08-01T20:00Z is already 2026-08-02 in Jakarta (UTC+7), which is the day
    // the user meant when they recorded it; the stored instant must not be kept.
    const legacy = {
      version: 1,
      wallets: [],
      transactions: [makeTx({ id: "t1", date: "2026-08-01T20:00:00.000Z" })],
      savingsTargets: [],
      budgets: [],
    };
    const migrated = migratePayload(legacy);
    expect(migrated).not.toBeNull();
    expect((migrated?.payload.transactions as { date: string }[])[0]?.date).toBe("2026-08-02");
    expect(migrated?.applied.map((migration) => migration.description)).toEqual([
      expect.stringMatching(/calendar dates/i),
      expect.stringMatching(/category records/i),
    ]);
  });

  it("migrates a realistic v2 dataset to v3 without rewriting financial records", () => {
    const legacyV2 = {
      version: 2,
      wallets: [
        makeWallet("bca", { name: "BCA" }),
        makeWallet("cash", { name: "Cash", type: "cash" }),
      ],
      transactions: [
        makeTx({ id: "open-bca", type: "opening_balance", amount: 1_000_000, destinationWalletId: "bca", date: on(2026, 9, 1), categoryId: null }),
        makeTx({ id: "salary", type: "income", amount: 2_500_000, destinationWalletId: "bca", categoryId: "gaji", date: on(2026, 9, 2) }),
        makeTx({ id: "food", type: "expense", amount: 125_000, sourceWalletId: "bca", categoryId: "makanan", date: on(2026, 9, 3) }),
        makeTx({ id: "transfer", type: "transfer", amount: 200_000, sourceWalletId: "bca", destinationWalletId: "cash", categoryId: null, date: on(2026, 9, 4) }),
      ],
      savingsTargets: [makeTarget("liburan", 5_000_000)],
      budgets: [makeBudget("makanan", "2026-09", 1_000_000, { id: "budget-food" })],
      settings: { currency: "IDR" },
    };

    const migrated = migratePayload(legacyV2);
    expect(migrated).not.toBeNull();
    expect(migrated?.applied.map((migration) => migration.to)).toEqual([STORAGE_VERSION]);
    const parsed = parsePersistedData(migrated?.payload);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.failure.issues));

    expect(parsed.data.wallets).toEqual(legacyV2.wallets);
    expect(parsed.data.transactions).toEqual(legacyV2.transactions);
    expect(parsed.data.savingsTargets).toEqual(legacyV2.savingsTargets);
    expect(parsed.data.budgets).toEqual(legacyV2.budgets);
    expect(parsed.data.transactions.map((transaction) => transaction.id)).toEqual(["open-bca", "salary", "food", "transfer"]);
    expect(parsed.data.transactions.map((transaction) => transaction.categoryId)).toEqual([null, "gaji", "makanan", null]);
    expect(parsed.data.budgets.map((budget) => budget.categoryId)).toEqual(["makanan"]);
    expect(parsed.data.transactions.map((transaction) => transaction.amount)).toEqual([1_000_000, 2_500_000, 125_000, 200_000]);
    expect(parsed.data.transactions.map((transaction) => transaction.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(parsed.data.categories.map((category) => category.id)).toEqual(seedDefaultCategories().map((category) => category.id));
    expect(new Set(parsed.data.categories.map((category) => category.id)).size).toBe(parsed.data.categories.length);

    const migratedAgain = migratePayload(parsed.data);
    expect(migratedAgain?.applied).toEqual([]);
    expect(migratedAgain?.payload).toEqual(parsed.data);
  });

  it("keeps every legacy built-in category id resolvable after migration", () => {
    const migrated = migratePayload({ version: 2, wallets: [], transactions: [], savingsTargets: [], budgets: [], settings: null });
    const parsed = parsePersistedData(migrated?.payload);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.failure.issues));

    for (const legacy of ALL_CATEGORIES) {
      expect(getCategoryMeta(legacy.id, parsed.data.categories)).toMatchObject({
        id: legacy.id,
        label: legacy.label,
        type: legacy.type,
        icon: legacy.icon,
      });
    }
  });

  it("refuses a newer schema version instead of silently rewriting it", () => {
    expect(migratePayload({ version: STORAGE_VERSION + 1, wallets: [] })).toBeNull();
    const parsed = parsePersistedData({ version: 7, wallets: [] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.reason).toBe("unsupported_version");
      expect(parsed.failure.needsNewerApp).toBe(true);
    }
  });

  it("refuses unrelated JSON", () => {
    const parsed = parsePersistedData({ hello: "world" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.failure.reason).toBe("not_object");
  });
});

describe("parsePersistedJson (corruption handling)", () => {
  it("reports invalid JSON without throwing", () => {
    for (const raw of ["", "{", "not json", "[1,2", '{"version":1,}']) {
      const result = parsePersistedJson(raw);
      expect(result.ok).toBe(false);
      if (!result.ok && raw !== "") expect(result.failure.reason).toBe("not_json");
    }
  });

  it("lists schema issues as strings for the recovery screen", () => {
    const result = parsePersistedJson(
      JSON.stringify({ version: 1, wallets: [{ id: "w1" }], transactions: [], savingsTargets: [], budgets: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("schema");
      expect(result.failure.issues.length).toBeGreaterThan(0);
      expect(result.failure.issues.every((issue) => typeof issue === "string")).toBe(true);
    }
  });

  it("runs cross-checks (references / chronology) on top of the schema", () => {
    const base = emptyData({
      wallets: [makeWallet("w1", { name: "Cash", type: "cash" })],
      transactions: [
        makeTx({
          id: "t1",
          type: "expense",
          amount: 5000,
          sourceWalletId: "w1",
          categoryId: "makanan",
          date: on(2026, 8, 1),
        }),
      ],
    });
    const baseParsed = parsePersistedData(base);
    if (!baseParsed.ok) throw new Error(JSON.stringify(baseParsed.failure.issues));
    expect(baseParsed.ok).toBe(true);

    const withDangling = {
      ...base,
      transactions: [
        ...base.transactions,
        makeTx({ id: "t2", type: "expense", amount: 1, sourceWalletId: "ghost", categoryId: "makanan" }),
      ],
    };
    const parsed = parsePersistedData(withDangling, [
      (data) => (data.transactions.some((t) => t.sourceWalletId === "ghost") ? ["transaksi merujuk dompet yang tidak ada"] : []),
    ]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.failure.reason).toBe("invariants");
      expect(parsed.failure.issues[0]).toMatch(/dompet/);
    }
  });

  it("round-trips a serialized export", () => {
    const data = emptyData({
      wallets: [makeWallet("w1", { name: "BCA" })],
      transactions: [
        makeTx({ id: "t1", type: "income", amount: 125_000, destinationWalletId: "w1", categoryId: null }),
      ],
      savingsTargets: [makeTarget("s1", 5000000)],
      budgets: [makeBudget("makanan", "2026-08", 1000000)],
      settings: { currency: "IDR" },
    });
    const text = serializePersistedData(data, at(2026, 9, 1));
    // The downloaded export (with appName/schemaVersion/exportedAt) must be
    // readable by the same parser that reads localStorage.
    expect(JSON.parse(text)).toMatchObject({ appName: "SmartSpend", schemaVersion: STORAGE_VERSION, exportedAt: at(2026, 9, 1) });
    const parsed = parsePersistedJson(text);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.failure.issues));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.wallets).toEqual(data.wallets);
      expect(parsed.data.transactions).toEqual(data.transactions);
      expect(parsed.migrations).toEqual([]);
    }
  });
});

describe("storage keys", () => {
  it("uses a versioned key and a namespaced corrupt backup prefix", () => {
    expect(STORAGE_KEY).toBe("smarts-end.v1");
    expect(CORRUPT_BACKUP_PREFIX).toBe("smarts-end.v1.corrupt.");
  });
});
