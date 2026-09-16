import { describe, expect, it } from "vitest";
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
  serializePersistedData,
} from "@/repository/storage-schema";
import { at, emptyData, makeBudget, makeTarget, makeTx, makeWallet } from "../fixtures";

/**
 * Spec §24–§33 — the versioned, Zod-validated persistence envelope.
 * Nothing stored is ever trusted: bad JSON must be *reported*, not repaired.
 */

describe("persistedDataSchema (v1 shape)", () => {
  it("accepts the documented envelope", () => {
    const payload = {
      version: 1,
      wallets: [makeWallet("w1")],
      transactions: [
        makeTx({ id: "t1", type: "expense", amount: 1000, sourceWalletId: "w1", categoryId: "makanan" }),
      ],
      savingsTargets: [makeTarget("s1")],
      budgets: [makeBudget("makanan", "2026-08", 1000000)],
      settings: { currency: "IDR" },
    };
    expect(persistedDataSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an unknown version", () => {
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, version: 2 }).success).toBe(false);
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

  it("rejects a timestamp that is not an ISO instant", () => {
    const transaction = { ...makeTx({ id: "t1" }), date: "15/08/2026" } as never;
    expect(persistedDataSchema.safeParse({ ...EMPTY_DATA, transactions: [transaction] }).success).toBe(false);
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
    expect(result?.payload.version).toBe(1);
    expect(result?.applied).toHaveLength(1);
  });

  it("refuses a newer schema version instead of silently rewriting it", () => {
    expect(migratePayload({ version: 2, wallets: [] })).toBeNull();
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
          date: at(2026, 8, 1),
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
    expect(JSON.parse(text)).toMatchObject({ appName: "SmartSpend", schemaVersion: 1, exportedAt: at(2026, 9, 1) });
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
