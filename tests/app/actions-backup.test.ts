import { describe, expect, it } from "vitest";
import {
  applyCreateSavingsTarget,
  applyCreateTransaction,
  applyCreateWallet,
  applyDeleteBudget,
  applyDeleteTransaction,
  applyUpdateSavingsTarget,
  applyUpdateTransaction,
  applyUpdateWallet,
  type AppData,
} from "@/app/actions";
import {
  buildExportPayload,
  exportFileName,
  parseImportJson,
  serializeExport,
  validateImportPayload,
} from "@/app/backup";
import { calculateSavingsBalance, calculateTotalMoney, calculateWalletBalance } from "@/domain/ledger";
import { seedDefaultCategories, STORAGE_VERSION } from "@/repository/storage-schema";
import { at, emptyData, on } from "../fixtures";

/**
 * Spec §42 + §63–§66 — export / import round trip and CRUD mutation paths.
 */

// A wallet's opening balance is stamped with the wallet's creation instant, so the
// fixture clock has to sit *after* every recorded transaction and *before* nothing.
// (The app refuses future-dated records, and a record can never spend money that
// only arrives later.)
const CREATED = new Date(at(2026, 8, 1, 8));
const NOW = new Date(at(2026, 8, 31, 18));

function ok<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function scenario() {
  let data = emptyData();
  data = ok(applyCreateWallet(data, { id: "bca", name: "BCA", type: "bank", openingBalance: 1_000_000, now: CREATED }));
  data = ok(applyCreateWallet(data, { id: "cash", name: "Cash", type: "cash", openingBalance: 0, now: CREATED }));
  data = ok(applyCreateSavingsTarget(data, { id: "dana", name: "Dana Darurat", targetAmount: 5_000_000, now: CREATED }));
  data = ok(
    applyCreateTransaction(data, {
      type: "expense",
      amount: 250_000,
      date: on(2026, 8, 10),
      sourceWalletId: "bca",
      categoryId: "makanan",
      paymentMethod: "qris",
      note: "Belanja bulanan",
      now: NOW,
    }),
  );
  data = ok(
    applyCreateTransaction(data, {
      type: "savings_deposit",
      amount: 300_000,
      date: on(2026, 8, 11),
      sourceWalletId: "bca",
      savingsTargetId: "dana",
      now: NOW,
    }),
  );
  return data;
}

describe("CRUD mutations keep the ledger consistent", () => {
  it("editing a transaction recalculates every derived balance", () => {
    let data = scenario();
    const expense = data.transactions.find((t) => t.type === "expense")!;
    data = ok(
      applyUpdateTransaction(
        data,
        expense.id,
        { type: "expense", amount: 400_000, date: on(2026, 8, 10), sourceWalletId: "bca", categoryId: "makanan", now: NOW },
      ),
    );
    // 1.000.000 opening - 400.000 expense - 300.000 deposit
    expect(calculateWalletBalance(data.transactions, "bca")).toBe(300_000);
    // Total Money = BCA 300.000 + Cash 0 + savings 300.000
    expect(calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total).toBe(600_000);
  });

  it("deleting a transaction recalculates too, and nothing else changes", () => {
    const data = scenario();
    const deposit = data.transactions.find((t) => t.type === "savings_deposit")!;
    const after = ok(applyDeleteTransaction(data, deposit.id));
    // only the deposit disappeared: 1.000.000 - 250.000 expense
    expect(calculateWalletBalance(after.transactions, "bca")).toBe(750_000);
    expect(calculateSavingsBalance(after.transactions, "dana")).toBe(0);
    expect(after.wallets).toEqual(data.wallets);
    expect(after.budgets).toEqual(data.budgets);
  });

  it("renaming a wallet never touches the ledger", () => {
    const data = scenario();
    const after = ok(applyUpdateWallet(data, { id: "bca", name: "BCA Utama", type: "bank", now: NOW }));
    expect(after.wallets.find((w) => w.id === "bca")?.name).toBe("BCA Utama");
    expect(after.transactions).toEqual(data.transactions);
    expect(calculateWalletBalance(after.transactions, "bca")).toBe(450_000);
  });

  it("an edit may reuse the money its previous version had locked up", () => {
    const data = scenario();
    const expense = data.transactions.find((t) => t.type === "expense")!;
    // 250.000 -> 1.000.000 is exactly the opening balance: allowed because the old
    // record disappears at the same time.
    const tooBig = applyUpdateTransaction(
      data,
      expense.id,
      { type: "expense", amount: 1_000_000, date: on(2026, 8, 10), sourceWalletId: "bca", categoryId: "makanan", now: NOW },
    );
    // ...but an edit that leaves nothing for the deposit recorded the next day is
    // still refused, because that deposit would have to come from an empty wallet.
    expect(tooBig.ok).toBe(false);
    // shrinking the later deposit instead makes the whole history valid again
    const smaller = ok(
      applyUpdateTransaction(
        data,
        expense.id,
        { type: "expense", amount: 700_000, date: on(2026, 8, 10), sourceWalletId: "bca", categoryId: "makanan", now: NOW },
      ),
    );
    expect(calculateWalletBalance(smaller.transactions, "bca")).toBe(0);
  });

  it("deleting an unknown id reports NOT_FOUND instead of corrupting state", () => {
    const data = scenario();
    const result = applyDeleteTransaction(data, "nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(applyDeleteBudget(data, "nope").ok).toBe(false);
  });

  it("a savings target has no manual progress field — only movements move it", () => {
    const data = scenario();
    const updated = ok(applyUpdateSavingsTarget(data, "dana", { name: "Dana Darurat Banget", targetAmount: 2_000_000 }, NOW));
    expect(calculateSavingsBalance(updated.transactions, "dana")).toBe(300_000);
    expect(Object.keys(updated.savingsTargets.find((t) => t.id === "dana")!)).not.toContain("savedAmount");
  });

  it("rejects a savings target below Rp1", () => {
    const data = scenario();
    expect(applyUpdateSavingsTarget(data, "dana", { targetAmount: 0 }, NOW).ok).toBe(false);
    expect(applyUpdateSavingsTarget(data, "dana", { targetAmount: 100.5 }, NOW).ok).toBe(false);
  });
});

describe("export payload (spec §63)", () => {
  it("carries the metadata and the six collections, and nothing else", () => {
    const data = scenario();
    const payload = buildExportPayload(data, NOW);
    expect(Object.keys(payload).sort()).toEqual(
      ["appName", "budgets", "categories", "exportedAt", "schemaVersion", "settings", "savingsTargets", "transactions", "version", "wallets"].sort(),
    );
    expect(payload.appName).toBe("SmartSpend");
    expect(payload.schemaVersion).toBe(STORAGE_VERSION);
    expect(payload.exportedAt).toBe(NOW.toISOString());
    expect(payload).toMatchObject({
      wallets: data.wallets,
      transactions: data.transactions,
      savingsTargets: data.savingsTargets,
      budgets: data.budgets,
      categories: data.categories,
    });
    // no derived balances leak into the file
    const text = serializeExport(data, NOW);
    expect(text).not.toMatch(/"balance"/);
    expect(text).not.toMatch(/"saved"/);
  });

  it("names the download file with the export date", () => {
    expect(exportFileName(new Date(at(2026, 9, 1, 13, 5)))).toBe("smarts-export-20260901-1305.json");
  });
});

describe("import validation (spec §64–§65)", () => {
  it("round-trips an exported file", () => {
    const data = scenario();
    const result = parseImportJson(serializeExport(data, NOW));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.wallets).toEqual(data.wallets);
      expect(result.data.transactions).toEqual(data.transactions);
      expect(result.data.savingsTargets).toEqual(data.savingsTargets);
      expect(result.data.budgets).toEqual(data.budgets);
      expect(result.data.categories).toEqual(data.categories);
      expect(result.data.version).toBe(STORAGE_VERSION);
      expect(result.preview.counts).toEqual({ wallets: 2, transactions: 3, savingsTargets: 1, budgets: 0 });
      expect(result.preview.firstTransactionDate).toBeTruthy();
      expect(result.warnings).toEqual([]);
    }
  });

  it("imports a representative pre-Phase-2H backup without rewriting ledger references", () => {
    const legacyBackup = {
      appName: "SmartSpend",
      schemaVersion: 2,
      exportedAt: at(2026, 9, 1),
      version: 2,
      wallets: [
        { id: "bca", name: "BCA", type: "bank", provider: null, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1), archivedAt: null },
        { id: "cash", name: "Cash", type: "cash", provider: null, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1), archivedAt: null },
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
        {
          id: "expense-old",
          type: "expense",
          amount: 250_000,
          sourceWalletId: "bca",
          categoryId: "makanan",
          date: on(2026, 8, 3),
          createdAt: at(2026, 8, 3),
          updatedAt: at(2026, 8, 3),
        },
      ],
      savingsTargets: [{ id: "dana", name: "Dana Darurat", targetAmount: 5_000_000, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1), archivedAt: null }],
      budgets: [{ id: "budget-food", categoryId: "makanan", month: "2026-08", limitAmount: 1_000_000, createdAt: at(2026, 8, 1), updatedAt: at(2026, 8, 1) }],
      settings: { currency: "IDR" },
    };

    const result = validateImportPayload(legacyBackup);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.wallets.map((wallet) => wallet.id)).toEqual(["bca", "cash"]);
    expect(result.data.transactions.map((transaction) => transaction.id)).toEqual(["income-old", "expense-old"]);
    expect(result.data.transactions.map((transaction) => transaction.categoryId)).toEqual(["gaji", "makanan"]);
    expect(result.data.budgets.map((budget) => budget.categoryId)).toEqual(["makanan"]);
    expect(result.data.savingsTargets.map((target) => target.id)).toEqual(["dana"]);
    expect(result.data.transactions.map((transaction) => transaction.amount)).toEqual([2_500_000, 250_000]);
    expect(result.data.transactions.map((transaction) => transaction.date)).toEqual(["2026-08-02", "2026-08-03"]);
    expect(result.data.categories.map((category) => category.id)).toEqual(seedDefaultCategories().map((category) => category.id));
    expect(new Set(result.data.categories.map((category) => category.id)).size).toBe(result.data.categories.length);
  });

  it("previews counts before the user confirms", () => {
    const payload = {
      version: 1,
      wallets: [{ id: "w", name: "Cash", type: "cash", provider: null, createdAt: at(2026, 1, 1), updatedAt: at(2026, 1, 1), archivedAt: null }],
      transactions: [],
      savingsTargets: [],
      budgets: [],
    };
    const result = validateImportPayload(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.counts.wallets).toBe(1);
      // empty collections are reported as warnings, not rejections
      expect(result.warnings).toEqual(["File tidak berisi transaksi."]);
      expect(result.preview.counts.transactions).toBe(0);
    }
  });

  it("rejects a file whose ledger is impossible, listing every problem", () => {
    const data = scenario();
    const broken = JSON.parse(serializeExport(data, NOW)) as Record<string, unknown> & {
      transactions: { id: string; amount: number }[];
    };
    broken.transactions = [
      ...broken.transactions,
      { id: "ghost", amount: 10 }, // missing required fields
    ];
    const result = validateImportPayload(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/ditolak/i);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects malformed category records without partially importing", () => {
    const broken = JSON.parse(serializeExport(scenario(), NOW)) as Record<string, unknown> & {
      categories: { id: string; icon: string }[];
    };
    broken.categories = [{ ...broken.categories[0]!, icon: "not-a-supported-icon" }];

    const result = validateImportPayload(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/skema/i);
      expect(result.issues.some((issue) => /categories/i.test(issue.path) && /Icon kategori/i.test(issue.message))).toBe(true);
    }
  });

  it("rejects dangling references and duplicate ids", () => {
    const base = emptyData({
      wallets: [{ id: "w", name: "Cash", type: "cash", createdAt: at(2026, 1, 1), updatedAt: at(2026, 1, 1), provider: null, archivedAt: null }],
    });
    const dangling = {
      ...base,
      transactions: [
        {
          id: "t1",
          type: "expense",
          amount: 1000,
          sourceWalletId: "missing-wallet",
          categoryId: "makanan",
          date: on(2026, 8, 1),
          createdAt: at(2026, 8, 1),
          updatedAt: at(2026, 8, 1),
        },
      ],
    };
    const result = validateImportPayload(dangling);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => /sumber/i.test(issue.message))).toBe(true);
  });

  it("refuses a newer schema version and non-object files", () => {
    expect(validateImportPayload([]).ok).toBe(false);
    expect(validateImportPayload("nope").ok).toBe(false);
    const newer = { version: STORAGE_VERSION + 1, wallets: [] };
    expect(validateImportPayload(newer).ok).toBe(false);
    const result = validateImportPayload(newer);
    if (!result.ok) expect(result.message).toMatch(new RegExp(`v${STORAGE_VERSION + 1}`, "i"));
  });

  it("refuses malformed JSON with a clear message", () => {
    const result = parseImportJson("{ not json ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/JSON/i);
  });
});

describe("import replaces the dataset wholesale (v1 semantics)", () => {
  it("importing a valid file yields exactly that file's data", () => {
    const source = scenario();
    const payload = JSON.parse(serializeExport(source, NOW));
    const result = validateImportPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported: AppData = result.data;
    expect(imported.wallets).toHaveLength(2);
    expect(imported.transactions).toHaveLength(3);
    expect(calculateTotalMoney(imported.wallets, imported.savingsTargets, imported.transactions).total).toBe(750_000);
  });
});
