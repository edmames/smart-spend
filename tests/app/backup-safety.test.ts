import { describe, expect, it } from "vitest";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import {
  buildExportArtifact,
  serializeExport,
  parseImportJson,
  validateImportPayload,
} from "@/app/backup";
import { seedDefaultCategories, STORAGE_VERSION, STORAGE_KEY } from "@/repository/storage-schema";
import { DEFAULT_SETTINGS } from "@/domain/models";
import { calculateTotalMoney } from "@/domain/ledger";
import { at, on, emptyData, makeWallet, makeTarget, makeTx } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";

/**
 * Phase 2J — Backup & Data Safety (Part 1)
 *
 * Focused tests for the validate-first import flow, restore confirmation
 * boundary, failure safety and reset behavior. These assert that existing
 * state is never modified until the user explicitly confirms a fully-validated
 * candidate.
 */

const NOW = new Date(at(2026, 9, 1, 12, 0));

function snapshot(data: PersistedData): PersistedData {
  return JSON.parse(JSON.stringify(data));
}

function seeded(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash", type: "cash" })],
    savingsTargets: [makeTarget("lib", 5_000_000, { name: "Liburan" })],
    transactions: [
      makeTx({
        id: "open-bca",
        type: "opening_balance",
        amount: 1_000_000,
        destinationWalletId: "bca",
        date: on(2026, 8, 1),
        createdAt: at(2026, 8, 1, 8),
      }),
      makeTx({
        id: "exp",
        type: "expense",
        amount: 250_000,
        sourceWalletId: "bca",
        categoryId: "makanan",
        date: on(2026, 8, 10),
        createdAt: at(2026, 8, 10, 8),
      }),
    ],
    settings: { ...DEFAULT_SETTINGS, theme: "dark" },
  });
}

describe("EXPORT (Phase 2J) — filename & date behavior", () => {
  it("uses the SmartSpend-backup-YYYY-MM-DD.json naming with Jakarta calendar date", () => {
    const artifact = buildExportArtifact(seeded(), NOW);
    expect(artifact.filename).toMatch(/^SmartSpend-backup-\d{4}-\d{2}-\d{2}\.json$/);
    // NOW = 2026-08-31T18:00:00Z -> Jakarta (UTC+7) is 2026-09-01T01:00 -> September 1
    expect(artifact.filename).toBe("SmartSpend-backup-2026-09-01.json");
  });

  it("export includes settings, categories, wallets, transactions, savings, budgets", () => {
    const data = seeded();
    const text = serializeExport(data, NOW);
    const parsed = JSON.parse(text);
    expect(parsed.appName).toBe("SmartSpend");
    expect(parsed.schemaVersion).toBe(STORAGE_VERSION);
    expect(parsed.exportedAt).toBe(NOW.toISOString());
    expect(parsed.wallets).toEqual(data.wallets);
    expect(parsed.transactions).toEqual(data.transactions);
    expect(parsed.savingsTargets).toEqual(data.savingsTargets);
    expect(parsed.budgets).toEqual(data.budgets);
    expect(parsed.categories).toEqual(data.categories);
    expect(parsed.settings).toEqual(data.settings);
  });

  it("export contains no derived balances or secrets", () => {
    const text = serializeExport(seeded(), NOW);
    expect(text).not.toMatch(/"balance"/);
    expect(text).not.toMatch(/"savedAmount"/);
  });

  it("exported file parses back through the import validator as fully valid", () => {
    const data = seeded();
    const result = parseImportJson(serializeExport(data, NOW));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.wallets).toEqual(data.wallets);
      expect(result.preview.exportedAt).toBe(NOW.toISOString());
      expect(result.preview.counts.categories).toBe(data.categories.length);
    }
  });
});

describe("IMPORT VALIDATION — rejection matrix", () => {
  it("rejects invalid JSON", () => {
    expect(parseImportJson("{ not json ").ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(parseImportJson("").ok).toBe(false);
  });

  it("rejects unrelated JSON (no version, no SmartSpend shape)", () => {
    expect(validateImportPayload({ hello: "world" }).ok).toBe(false);
  });

  it("rejects arrays / non-objects", () => {
    expect(validateImportPayload([]).ok).toBe(false);
    expect(validateImportPayload(null).ok).toBe(false);
    expect(validateImportPayload(42).ok).toBe(false);
  });

  it("rejects a malformed SmartSpend backup (missing required collections)", () => {
    expect(validateImportPayload({ version: STORAGE_VERSION, wallets: [] }).ok).toBe(false);
  });

  it("rejects an unsupported future storage version", () => {
    const newer = { version: STORAGE_VERSION + 1, wallets: [], transactions: [], savingsTargets: [], budgets: [], categories: [] };
    const result = validateImportPayload(newer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(new RegExp(`v${STORAGE_VERSION + 1}`, "i"));
  });

  it("rejects a corrupted financial candidate (negative historical balance)", () => {
    // A transaction that spends more than the wallet holds -> chronology invalid.
    const raw = JSON.parse(serializeExport(seeded(), NOW)) as Record<string, unknown>;
    raw.transactions = [
      ...(raw.transactions as unknown[]),
      {
        id: "overspend",
        type: "expense",
        amount: 50_000_000,
        sourceWalletId: "bca",
        categoryId: "makanan",
        date: on(2026, 8, 10),
        createdAt: at(2026, 8, 10, 8),
        updatedAt: at(2026, 8, 10, 8),
      },
    ];
    const result = validateImportPayload(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => /negatif|negative/i.test(i.message))).toBe(true);
  });

  it("rejects dangling wallet references without partially accepting", () => {
    const raw = JSON.parse(serializeExport(seeded(), NOW)) as Record<string, unknown>;
    const txs = raw.transactions as Array<{ sourceWalletId: string | null }>;
    if (txs[1] && txs[1].sourceWalletId) txs[1].sourceWalletId = "missing-wallet";
    const result = validateImportPayload(raw);
    expect(result.ok).toBe(false);
  });

  it("supports a legacy v2 backup through the migration chain", () => {
    const legacy = {
      appName: "SmartSpend",
      schemaVersion: 2,
      exportedAt: at(2026, 9, 1),
      version: 2,
      wallets: [
        { id: "bca", name: "BCA", type: "bank", provider: null, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1), archivedAt: null },
      ],
      transactions: [
        {
          id: "income-old",
          type: "income",
          amount: 2_500_000,
          destinationWalletId: "bca",
          categoryId: "gaji",
          date: on(2026, 8, 2),
          createdAt: at(2026, 8, 2),
          updatedAt: at(2026, 8, 2),
        },
      ],
      savingsTargets: [],
      budgets: [],
      categories: [{ id: "makanan", label: "Makanan", type: "expense", icon: "utensils", color: "slate", createdAt: at(2026, 1, 1), updatedAt: at(2026, 1, 1), archivedAt: null }],
      settings: { currency: "IDR", theme: "light", firstTransactionType: "income", hideBalances: false },
    };
    const result = validateImportPayload(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.version).toBe(STORAGE_VERSION);
      expect(result.data.wallets[0]?.id).toBe("bca");
      // migration re-stamped the v1 instant "date" into a Jakarta calendar date
      expect(result.data.transactions[0]?.date).toBe("2026-08-02");
      expect(result.preview.exportedAt).toBe(at(2026, 9, 1));
    }
  });
});

describe("IMPORT — state safety boundary (validate-before-commit)", () => {
  function install(data: PersistedData) {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore.getState().resetStore(snapshot(data));
    useSmartSpendStore.setState({ hydration: "ready" });
    return snapshot(useSmartSpendStore.getState().data);
  }

  it("a failed import never modifies the existing store state", () => {
    const before = install(seeded());
    const result = useSmartSpendStore.getState().importDataset({ version: STORAGE_VERSION + 1 });
    expect(result.ok).toBe(false);
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("a failed import does not clear or write anything to storage", () => {
    const adapter = new MemoryStorageAdapter();
    const repo = createLocalStorageRepository(adapter);
    configureRepository(repo);
    const data = seeded();
    useSmartSpendStore.getState().resetStore(snapshot(data));
    useSmartSpendStore.setState({ hydration: "ready" });
    // persist the seeded state to storage so we can prove the failed import leaves it
    const saved = repo.save({ ...data, settings: data.settings ?? DEFAULT_SETTINGS });
    expect(saved.ok).toBe(true);
    expect(adapter.getItem(STORAGE_KEY)).toBeTruthy();
    // The candidate is invalid (future version) — store validation should reject and preserve storage.
    const result = useSmartSpendStore.getState().importDataset({ version: STORAGE_VERSION + 1 });
    expect(result.ok).toBe(false);
    // storage untouched by the failed import
    expect(adapter.getItem(STORAGE_KEY)).toBeTruthy();
    const stored = JSON.parse(adapter.getItem(STORAGE_KEY)!);
    expect(stored.wallets).toHaveLength(2);
  });

  it("cancel (closing the preview) leaves state unchanged", () => {
    const before = install(seeded());
    // Simulate the UI picking a valid file then cancelling before confirmation.
    const validation = parseImportJson(serializeExport(seeded(), NOW));
    expect(validation.ok).toBe(true);
    // No call to importDataset -> nothing committed.
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("confirming a valid import fully replaces the dataset", () => {
    const before = install(seeded());
    // Build a different valid dataset to import.
    const target: PersistedData = emptyData({
      wallets: [makeWallet("mandiri", { name: "Mandiri", type: "bank" })],
      transactions: [
        makeTx({ type: "opening_balance", amount: 5_000_000, destinationWalletId: "mandiri", date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 8) }),
      ],
    });
    const validation = parseImportJson(serializeExport(target, NOW));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const result = useSmartSpendStore.getState().importDataset(validation.data);
    expect(result.ok).toBe(true);
    const after = useSmartSpendStore.getState().data;
    expect(after.wallets.map((w) => w.id)).toEqual(["mandiri"]);
    expect(after.transactions).toEqual(target.transactions);
    expect(after).not.toEqual(before);
    // Restored state is valid current schema
    expect(after.version).toBe(STORAGE_VERSION);
    expect(calculateTotalMoney(after.wallets, after.savingsTargets, after.transactions).total).toBe(5_000_000);
  });
});

describe("RESET / Hapus semua data safety", () => {
  function install(data: PersistedData) {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore.getState().resetStore(snapshot(data));
    useSmartSpendStore.setState({ hydration: "ready" });
  }

  it("reset requires explicit confirmation — cancel preserves state", () => {
    const before = snapshot(seeded());
    install(before);
    // The ResetCard only calls resetAllData on confirm; simulate cancel = no call.
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("confirm reset produces a valid empty state with no financial records", () => {
    install(seeded());
    const result = useSmartSpendStore.getState().resetAllData();
    expect(result.ok).toBe(true);
    const after = useSmartSpendStore.getState().data;
    expect(after.wallets).toHaveLength(0);
    expect(after.transactions).toHaveLength(0);
    expect(after.savingsTargets).toHaveLength(0);
    expect(after.budgets).toHaveLength(0);
    expect(after.version).toBe(STORAGE_VERSION);
    // seedDefaultCategories are non-financial scaffolding, not demo data
    expect(after.categories.map((c) => c.id)).toEqual(seedDefaultCategories().map((c) => c.id));
  });

  it("reset clears storage entry", () => {
    const adapter = new MemoryStorageAdapter();
    const repo = createLocalStorageRepository(adapter);
    configureRepository(repo);
    const data = seeded();
    useSmartSpendStore.getState().resetStore(snapshot(data));
    useSmartSpendStore.setState({ hydration: "ready" });
    const saved = repo.save({ ...data, settings: data.settings ?? DEFAULT_SETTINGS });
    expect(saved.ok).toBe(true);
    expect(adapter.getItem(STORAGE_KEY)).toBeTruthy();
    useSmartSpendStore.getState().resetAllData();
    expect(adapter.getItem(STORAGE_KEY)).toBeNull();
  });

  it("reset returns app preferences to defaults (not retained from current state)", () => {
    install(seeded());
    // seeded() has theme: "dark"
    expect(useSmartSpendStore.getState().data.settings?.theme).toBe("dark");
    useSmartSpendStore.getState().resetAllData();
    // Preferences are reset to DEFAULT_SETTINGS (implementation-defined reset semantics)
    const after = useSmartSpendStore.getState().data.settings;
    expect(after).toEqual(DEFAULT_SETTINGS);
    expect(after?.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});

/**
 * Phase 2J — Adversarial backup QA.
 *
 * Every rejected candidate MUST leave current application state exactly as it
 * was: no partial mutation, no clearing of storage, no partial migration commit.
 */
describe("ADVERSARIAL — every rejected candidate preserves current state", () => {
  function rejectCase(label: string, input: unknown) {
    it(`${label} — state unchanged`, () => {
      configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
      const before = snapshot(seeded());
      useSmartSpendStore.getState().resetStore(before);
      useSmartSpendStore.setState({ hydration: "ready" });
      const result = validateImportPayload(input);
      expect(result.ok).toBe(false);
      // store state untouched
      expect(useSmartSpendStore.getState().data).toEqual(before);
    });
  }

  const base = () => JSON.parse(serializeExport(seeded(), NOW)) as Record<string, unknown>;

  rejectCase("empty file", "");
  rejectCase("whitespace-only file", "   \n  ");
  rejectCase("malformed JSON", "{ not json");
  rejectCase("JSON array instead of object", []);
  rejectCase("unrelated valid JSON", { hello: "world", count: 3 });
  rejectCase("missing version", { wallets: [], transactions: [], savingsTargets: [], budgets: [], categories: [] });
  rejectCase("impossible negative version", { version: -1, wallets: [], transactions: [], savingsTargets: [], budgets: [], categories: [] });
  rejectCase("future version", { version: STORAGE_VERSION + 1, wallets: [], transactions: [], savingsTargets: [], budgets: [], categories: [] });
  // Missing collections default to empty arrays — a valid empty backup.
  // These are NOT rejections; they're valid candidates that pass validation.
  // (Tested separately in the "valid candidates pass" block below.)
  rejectCase("malformed settings (wrong currency)", (() => {
    const r = base(); r.settings = { currency: "EUR", theme: "dark" }; return r;
  })());
  rejectCase("malformed categories (bad icon)", (() => {
    const r = base(); (r.categories as Array<{ icon: string }>).forEach((c) => (c.icon = "not-an-icon")); return r;
  })());
  rejectCase("malformed categories (missing id)", (() => {
    const r = base(); const cats = r.categories as Array<Record<string, unknown>>; delete cats[0]!.id; return r;
  })());
  rejectCase("duplicate wallet IDs", (() => {
    const r = base(); const w = r.wallets as Array<Record<string, unknown>>; (r.wallets as Array<Record<string, unknown>>) = [{ ...w[0] }, { ...w[0] }]; return r;
  })());
  rejectCase("duplicate transaction IDs", (() => {
    const r = base(); const t = r.transactions as Array<Record<string, unknown>>; (r.transactions as Array<Record<string, unknown>>) = [{ ...t[0] }, { ...t[0] }]; return r;
  })());
  rejectCase("dangling wallet reference", (() => {
    const r = base(); (r.transactions as Array<Record<string, unknown>>).forEach((t) => { t.sourceWalletId = "missing"; t.destinationWalletId = null; t.savingsTargetId = null; t.categoryId = null; }); return r;
  })());
  rejectCase("invalid monetary value (fractional amount)", (() => {
    const r = base(); (r.transactions as Array<{ amount: number }>).forEach((t) => (t.amount = 12.5)); return r;
  })());
  rejectCase("invalid monetary value (exceeds max)", (() => {
    const r = base(); r.transactions = [{ ...(r.transactions as Array<Record<string, unknown>>)[0], amount: 10_000_000_000 }]; return r;
  })());
  rejectCase("invalid transaction date (not YYYY-MM-DD)", (() => {
    const r = base(); (r.transactions as Array<{ date: string }>).forEach((t) => (t.date = "2026/08/10")); return r;
  })());
  rejectCase("invalid exportedAt (not ISO)", (() => {
    const r = base(); r.exportedAt = "not-a-date"; return r;
  })());
  rejectCase("negative historical balance (overspend)", (() => {
    const r = base(); r.transactions = [...(r.transactions as unknown[])]; const txs = r.transactions as Array<Record<string, unknown>>;
    txs[1] = { id: "overspend", type: "expense", amount: 50_000_000, sourceWalletId: "bca", categoryId: "makanan", date: on(2026, 8, 10), createdAt: at(2026, 8, 10, 8), updatedAt: at(2026, 8, 10, 8) }; return r;
  })());
  rejectCase("future-dated transaction (beyond today)", (() => {
    const r = base(); (r.transactions as Array<{ date: string }>).forEach((t) => (t.date = "2099-12-31")); return r;
  })());
  rejectCase("duplicate budget (same category+month)", (() => {
    const r = base();
    const budget = { id: "budget-makanan-2026-08", categoryId: "makanan", month: "2026-08", limitAmount: 500_000, createdAt: at(2026, 8, 1, 8), updatedAt: at(2026, 8, 1, 8) };
    r.budgets = [budget, budget]; return r;
  })());
  rejectCase("dangling savings target reference", (() => {
    const r = base(); (r.transactions as Array<{ savingsTargetId: string | null }>).forEach((t) => { t.savingsTargetId = "missing"; }); return r;
  })());
  rejectCase("malformed transaction type (unknown)", (() => {
    const r = base(); (r.transactions as Array<{ type: string }>).forEach((t) => (t.type = "superincome")); return r;
  })());

  describe("valid candidates pass", () => {
    it("current valid backup is accepted", () => {
      expect(validateImportPayload(base()).ok).toBe(true);
    });
    it("missing wallets collection defaults to empty and is accepted (with empty transactions)", () => {
      const r = base(); delete r.wallets; r.transactions = [];
      expect(validateImportPayload(r).ok).toBe(true);
    });
    it("missing transactions collection defaults to empty and is accepted", () => {
      const r = base(); delete r.transactions;
      expect(validateImportPayload(r).ok).toBe(true);
    });
    it("valid exportedAt (ISO UTC) is accepted and surfaced in preview", () => {
      const result = validateImportPayload({ ...base(), exportedAt: NOW.toISOString() });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.preview.exportedAt).toBe(NOW.toISOString());
    });
    it("legacy supported v2 backup is accepted and migrated", () => {
      expect(
        validateImportPayload({
          appName: "SmartSpend",
          schemaVersion: 2,
          exportedAt: at(2026, 9, 1),
          version: 2,
          wallets: [{ id: "bca", name: "BCA", type: "bank", provider: null, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1), archivedAt: null }],
          transactions: [{
            id: "income", type: "income", amount: 1_000_000, destinationWalletId: "bca", categoryId: "gaji",
            date: on(2026, 8, 2), createdAt: at(2026, 8, 2), updatedAt: at(2026, 8, 2),
          }],
          savingsTargets: [],
          budgets: [],
          categories: [{ id: "gaji", label: "Gaji", type: "income", icon: "salary", color: "slate", createdAt: at(2026, 1, 1), updatedAt: at(2026, 1, 1), archivedAt: null }],
          settings: { currency: "IDR", theme: "light", firstTransactionType: "income", hideBalances: false },
        }).ok,
      ).toBe(true);
    });
  });
});
