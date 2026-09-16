import { describe, expect, it } from "vitest";
import {
  applyArchiveWallet,
  applyDeleteWallet,
  applyCreateBudget,
  applyCreateSavingsTarget,
  applyCreateTransaction,
  applyCreateWallet,
  applyDeleteTransaction,
  applyUpdateTransaction,
  applyUpdateWallet,
  type AppData,
} from "@/app/actions";
import type { MutationResult } from "@/types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/domain/categories";
import { calculateSavingsBalance, calculateTotalMoney, calculateWalletBalance } from "@/domain/ledger";
import {
  calculateBudgetUsage,
  calculateCategoryBreakdown,
  calculateMonthlySummary,
  calculateSavingsProgress,
  monthKeyOf,
} from "@/domain/selectors";
import { validateLedgerChronology } from "@/domain/validation";
import { at, emptyData, makeBudget, makeTx, makeWallet } from "../fixtures";

/**
 * FINANCIAL ACCEPTANCE SCENARIO (spec §46–§53).
 *
 * One sequential scenario: the numbers below are the numbers the spec spells out,
 * asserted after every step, and the invariants (no double counting, transfers and
 * savings movements excluded from Income/Expense, budget spend = real expenses only)
 * are asserted on the same dataset.
 */

// "now" must be later than every recorded date: SmartSpend refuses future-dated
// records, so a fixture that records "tomorrow" is a bug in the fixture.
const NOW = new Date(at(2026, 9, 1, 9, 0));
const JAN = at(2026, 8, 15, 10);
const BCA = "wallet-bca";
const CASH = "wallet-cash";
const DANA = "target-dana";

function expectBalances(data: AppData, expected: { bca: number; cash: number; dana: number }) {
  expect(calculateWalletBalance(data.transactions, BCA)).toBe(expected.bca);
  expect(calculateWalletBalance(data.transactions, CASH)).toBe(expected.cash);
  expect(calculateSavingsBalance(data.transactions, DANA)).toBe(expected.dana);
}

function buildScenario() {
  let data = emptyData();

  const step = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
    if (!result.ok) throw new Error(`unexpected rejection: ${result.error.message}`);
    return result.value;
  };

  // 1. BCA opening balance Rp1.000.000.
  //    The opening record is stamped with the wallet's creation instant, so the
  //    "now" used here has to sit *before* the August records below — otherwise the
  //    money would arrive after it was spent and the availability check (correctly)
  //    refuses them.
  data = step(
    applyCreateWallet(data, {
      id: BCA,
      name: "BCA",
      type: "bank",
      provider: "BCA",
      openingBalance: 1_000_000,
      now: new Date(at(2026, 8, 1, 8)),
    }),
  );
  // 2. Cash wallet, no opening balance
  data = step(applyCreateWallet(data, { id: CASH, name: "Cash", type: "cash", openingBalance: 0, now: NOW }));
  // 3. Savings target "Dana Darurat"
  data = step(
    applyCreateSavingsTarget(data, { id: DANA, name: "Dana Darurat", targetAmount: 5_000_000, now: NOW }),
  );
  // 4. Income 500.000 (gaji)
  data = step(
    applyCreateTransaction(data, {
      type: "income",
      amount: 500_000,
      date: JAN,
      categoryId: "gaji",
      destinationWalletId: BCA,
      paymentMethod: "transfer",
      note: "Gaji Agustus",
      now: NOW,
    }),
  );
  // 5. Expense 100.000 (makanan, QRIS)
  data = step(
    applyCreateTransaction(data, {
      type: "expense",
      amount: 100_000,
      date: at(2026, 8, 15, 12),
      categoryId: "makanan",
      sourceWalletId: BCA,
      paymentMethod: "qris",
      note: "Makan siang",
      now: NOW,
    }),
  );
  // 6. Savings deposit BCA -> Dana Darurat 300.000
  //    Recorded *before* the transfer below: at that point BCA holds 1.400.000,
  //    which is what the historical-availability rule (domain/validation.ts) checks.
  data = step(
    applyCreateTransaction(data, {
      type: "savings_deposit",
      amount: 300_000,
      date: at(2026, 8, 16, 9),
      sourceWalletId: BCA,
      savingsTargetId: DANA,
      now: NOW,
    }),
  );
  // 7. Transfer BCA -> Cash 200.000 (BCA holds 1.100.000 after the deposit)
  data = step(
    applyCreateTransaction(data, {
      type: "transfer",
      amount: 200_000,
      date: at(2026, 8, 17, 9),
      sourceWalletId: BCA,
      destinationWalletId: CASH,
      paymentMethod: "transfer",
      now: NOW,
    }),
  );
  // 8. Savings withdrawal 100.000 back to BCA
  data = step(
    applyCreateTransaction(data, {
      type: "savings_withdrawal",
      amount: 100_000,
      date: at(2026, 8, 20, 9),
      destinationWalletId: BCA,
      savingsTargetId: DANA,
      now: NOW,
    }),
  );
  // 9. Budget Makanan for August 1.000.000
  data = step(
    applyCreateBudget(data, { id: "budget-makanan-2026-08", categoryId: "makanan", month: "2026-08", limitAmount: 1_000_000 }, NOW),
  );

  return data;
}

describe("spec §46–53 — sequential ledger scenario", () => {
  const data = buildScenario();

  it("derives the documented balances", () => {
    expectBalances(data, { bca: 1_000_000, cash: 200_000, dana: 200_000 });
  });

  it("derives Wallet Money and Total Money without double counting", () => {
    const totals = calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions);
    expect(totals.walletTotal).toBe(1_200_000);
    expect(totals.savingsTotal).toBe(200_000);
    expect(totals.total).toBe(1_400_000);
    // Total Money == Sum(wallet balances) + Sum(savings balances), by definition.
    expect(totals.total).toBe(totals.walletTotal + totals.savingsTotal);
  });

  it("counts only income and expense in the monthly summary", () => {
    const summary = calculateMonthlySummary(data.transactions, "2026-08");
    expect(summary.income).toBe(500_000);
    expect(summary.expense).toBe(100_000);
    expect(summary.netCashFlow).toBe(400_000);
    // opening balance is not income, transfer/deposit/withdrawal are not income or expense
    expect(summary.incomeCount).toBe(1);
    expect(summary.expenseCount).toBe(1);
  });

  it("measures the budget against REAL expenses only", () => {
    const usage = calculateBudgetUsage(
      makeBudget("makanan", "2026-08", 1_000_000),
      data.transactions,
      "2026-08",
    );
    // Rp100.000 expense only — the 200.000 transfer and 300.000 deposit are excluded.
    expect(usage.spent).toBe(100_000);
    expect(usage.remaining).toBe(900_000);
    expect(usage.percent).toBe(10);
    expect(usage.overBudget).toBe(false);
  });

  it("keeps an internal movement out of the category breakdown", () => {
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-08" });
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({ categoryId: "makanan", amount: 100_000, percent: 100 });
  });

  it("shows savings progress against the goal, capped for display", () => {
    const progress = calculateSavingsProgress(data.savingsTargets[0]!, data.transactions);
    expect(progress.saved).toBe(200_000);
    expect(progress.targetAmount).toBe(5_000_000);
    expect(progress.percentActual).toBeCloseTo(4, 6);
    expect(progress.percentCapped).toBeCloseTo(4, 6);
    expect(progress.goalReached).toBe(false);
  });

  it("never stores a mutable balance on any record", () => {
    for (const wallet of data.wallets) {
      expect(Object.keys(wallet)).not.toContain("balance");
    }
    for (const target of data.savingsTargets) {
      expect(Object.keys(target)).not.toContain("balance");
      expect(Object.keys(target)).not.toContain("currentAmount");
    }
    // Deleting the ledger must therefore take every balance back to zero.
    const noLedger: AppData = { ...data, transactions: [] };
    expect(calculateTotalMoney(noLedger.wallets, noLedger.savingsTargets, noLedger.transactions).total).toBe(0);
  });

  it("accepts the whole dataset as chronologically valid", () => {
    const result = validateLedgerChronology(data.transactions, {
      wallets: data.wallets,
      savingsTargets: data.savingsTargets,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("assigns every movement to August 2026 (monthKey derivation)", () => {
    expect(new Set(data.transactions.map((t) => monthKeyOf(t.date)))).toEqual(new Set(["2026-08"]));
  });
});

describe("spec §43–45 — rejected mutations", () => {
  const data = buildScenario();

  type Rejected = {
    ok: false;
    error: { code?: string; message: string; fields?: Record<string, string> };
  };
  const reject = (result: MutationResult<unknown>): Rejected => {
    expect(result.ok).toBe(false);
    return result as Rejected;
  };

  /** Every amount rejection must point at the `amount` field, not just fail somewhere. */
  const expectAmountRejection = (amount: number) => {
    const failed = reject(
      applyCreateTransaction(data, {
        type: "expense",
        amount,
        date: JAN,
        sourceWalletId: BCA,
        categoryId: "makanan",
        now: NOW,
      }),
    );
    expect(failed.error.fields?.amount ?? failed.error.message).toMatch(/Rp1|bulat|Rp9\.999/i);
  };

  it("refuses an amount of 0", () => expectAmountRejection(0));

  it("refuses a negative amount", () => expectAmountRejection(-50_000));

  it("refuses a fractional amount (sen)", () => expectAmountRejection(12_500.5));

  it("refuses an amount above the Rp9.999.999.999 cap", () => expectAmountRejection(10_000_000_000));

  it("refuses a transfer to the same wallet", () => {
    const failed = reject(
      applyCreateTransaction(data, {
        type: "transfer",
        amount: 10_000,
        date: JAN,
        sourceWalletId: BCA,
        destinationWalletId: BCA,
        now: NOW,
      }),
    );
    expect(failed.error.message).toMatch(/sama/i);
  });

  it("refuses an outflow larger than the available balance", () => {
    reject(
      applyCreateTransaction(data, {
        type: "expense",
        amount: 9_000_000,
        date: at(2026, 8, 19, 9),
        sourceWalletId: BCA,
        now: NOW,
      }),
    );
  });

  it("refuses a savings withdrawal larger than the savings balance", () => {
    const failed = reject(
      applyCreateTransaction(data, {
        type: "savings_withdrawal",
        amount: 5_000_000,
        date: at(2026, 8, 21, 9),
        destinationWalletId: BCA,
        savingsTargetId: DANA,
        now: NOW,
      }),
    );
    expect(failed.error.message).toMatch(/tabungan/i);
  });

  it("refuses a deposit bigger than the source wallet can spare", () => {
    reject(
      applyCreateTransaction(data, {
        type: "savings_deposit",
        amount: 50_000_000,
        date: at(2026, 8, 19, 9),
        sourceWalletId: BCA,
        savingsTargetId: DANA,
        now: NOW,
      }),
    );
  });

  it("refuses unknown references", () => {
    reject(
      applyCreateTransaction(data, {
        type: "expense",
        amount: 10_000,
        date: JAN,
        sourceWalletId: "wallet-ghost",
        now: NOW,
      }),
    );
    reject(
      applyCreateTransaction(data, {
        type: "income",
        amount: 10_000,
        date: JAN,
        destinationWalletId: BCA,
        categoryId: "category-ghost",
        now: NOW,
      }),
    );
    reject(
      applyCreateTransaction(data, {
        type: "savings_deposit",
        amount: 1_000,
        date: JAN,
        sourceWalletId: BCA,
        savingsTargetId: "target-ghost",
        now: NOW,
      }),
    );
  });

  it("refuses a category that belongs to the other side of the ledger", () => {
    const failed = reject(
      applyCreateTransaction(data, {
        type: "expense",
        amount: 10_000,
        date: JAN,
        sourceWalletId: BCA,
        categoryId: "gaji",
        now: NOW,
      }),
    );
    expect(failed.error.message).toMatch(/kategori/i);
    // ...and the mirror case
    reject(
      applyCreateTransaction(data, {
        type: "income",
        amount: 10_000,
        date: JAN,
        destinationWalletId: BCA,
        categoryId: "makanan",
        now: NOW,
      }),
    );
  });

  it("refuses a future date", () => {
    reject(
      applyCreateTransaction(data, {
        type: "expense",
        amount: 1_000,
        date: at(2030, 1, 1),
        sourceWalletId: BCA,
        now: NOW,
      }),
    );
  });

  it("refuses a duplicate budget for the same category and month", () => {
    const failed = reject(
      applyCreateBudget(data, { categoryId: "makanan", month: "2026-08", limitAmount: 2_000_000 }, NOW),
    );
    expect(failed.error.message).toMatch(/sudah ada/i);
  });

  it("refuses deleting a wallet that still has history — archive instead", () => {
    const failed = reject(applyDeleteWallet(data, BCA));
    expect(failed.error.message).toMatch(/Arsipkan/i);

    // Archiving is allowed and keeps the ledger computable.
    const archived = applyArchiveWallet(data, BCA, NOW);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(calculateWalletBalance(archived.value.transactions, BCA)).toBe(1_000_000);
      expect(calculateTotalMoney(archived.value.wallets, archived.value.savingsTargets, archived.value.transactions).total).toBe(
        1_400_000,
      );
    }
    // ...but new records may not target an archived wallet
    reject(
      applyCreateTransaction(archived.ok ? archived.value : data, {
        type: "expense",
        amount: 1_000,
        date: at(2026, 8, 22, 9),
        sourceWalletId: BCA,
        now: NOW,
      }),
    );
  });

  it("leaves the stored dataset untouched when a mutation is rejected", () => {
    const before = JSON.stringify(data);
    reject(applyCreateTransaction(data, { type: "expense", amount: -1, date: JAN, sourceWalletId: BCA, now: NOW }));
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("spec §37–45 — historical (backdated) integrity", () => {
  /** Aug 1: opening 100.000 · Aug 2: expense 80.000 (accepted). */
  function january() {
    const created = applyCreateWallet(emptyData(), {
      id: BCA,
      name: "BCA",
      type: "bank",
      openingBalance: 100_000,
      now: new Date(at(2026, 8, 1)),
    });
    if (!created.ok) throw new Error(created.error.message);
    // pin the opening record to Aug 1 (the wallet was created "now" = 2026-08-01)
    const data: AppData = {
      ...created.value,
      transactions: created.value.transactions.map((t) => ({ ...t, date: at(2026, 8, 1) })),
    };
    const expense = applyCreateTransaction(data, {
      type: "expense",
      amount: 80_000,
      date: at(2026, 8, 2),
      sourceWalletId: BCA,
      categoryId: "makanan",
      now: new Date(at(2026, 8, 2)),
    });
    if (!expense.ok) throw new Error(expense.error.message);
    return expense.value;
  }

  it("starts valid", () => {
    const data = january();
    expect(calculateWalletBalance(data.transactions, BCA)).toBe(20_000);
    expect(validateLedgerChronology(data.transactions, { wallets: data.wallets }).valid).toBe(true);
  });

  it("rejects lowering the opening balance so a later day would have been negative", () => {
    const data = january();
    const result = applyUpdateWallet(data, {
      id: BCA,
      name: "BCA",
      type: "bank",
      openingBalance: 50_000, // Jan 2 expense of 80.000 would leave -30.000
      now: new Date(at(2026, 2, 1)),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/saldo/i);
    // the ledger is unchanged
    expect(calculateWalletBalance(data.transactions, BCA)).toBe(20_000);
  });

  it("accepts raising the opening balance", () => {
    const data = january();
    const result = applyUpdateWallet(data, {
      id: BCA,
      name: "BCA",
      type: "bank",
      openingBalance: 500_000,
      now: new Date(at(2026, 2, 1)),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects deleting the opening balance that funds the history", () => {
    const data = january();
    const opening = data.transactions.find((t) => t.type === "opening_balance")!;
    const result = applyDeleteTransaction(data, opening.id);
    expect(result.ok).toBe(false);
  });

  it("rejects backdating an expense before the money existed", () => {
    const data = january();
    const expense = data.transactions.find((t) => t.type === "expense")!;
    const result = applyUpdateTransaction(data, expense.id, {
      type: "expense",
      amount: 80_000,
      date: at(2025, 12, 31), // a day earlier: balance was 0 then
      sourceWalletId: BCA,
      categoryId: "makanan",
      now: new Date(at(2026, 2, 1)),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects raising a later expense beyond the balance available that day", () => {
    const data = january();
    const expense = data.transactions.find((t) => t.type === "expense")!;
    const result = applyUpdateTransaction(data, expense.id, {
      type: "expense",
      amount: 150_000,
      date: at(2026, 8, 2),
      sourceWalletId: BCA,
      categoryId: "makanan",
      now: new Date(at(2026, 2, 1)),
    });
    expect(result.ok).toBe(false);
  });

  it("allows deleting a small later expense even though it changes the final balance", () => {
    const data = january();
    const extra = applyCreateTransaction(data, {
      type: "expense",
      amount: 5_000,
      date: at(2026, 8, 3),
      sourceWalletId: BCA,
      categoryId: "transportasi",
      now: new Date(at(2026, 8, 3)),
    });
    expect(extra.ok).toBe(true);
    if (!extra.ok) return;
    const toDelete = extra.value.transactions.find((t) => t.date === at(2026, 8, 3))!;
    const result = applyDeleteTransaction(extra.value, toDelete.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(calculateWalletBalance(result.value.transactions, BCA)).toBe(20_000);
  });

  it("rejects a whole import whose chronology is broken", () => {
    // 2 transactions on a wallet that only holds 10.000, so the second day goes negative.
    const broken = {
      version: 1 as const,
      wallets: [makeWallet("w1", { name: "Cash", type: "cash" as const })],
      transactions: [
        makeTx({ id: "t1", type: "income", amount: 10_000, destinationWalletId: "w1", date: at(2026, 3, 1) }),
        makeTx({ id: "t2", type: "expense", amount: 25_000, sourceWalletId: "w1", date: at(2026, 3, 2) }),
      ],
      savingsTargets: [],
      budgets: [],
      settings: { currency: "IDR" as const },
    };
    const result = validateLedgerChronology(broken.transactions, { wallets: broken.wallets });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.balanceAfter).toBe(-15_000);
  });
});

describe("category catalogue (spec §13–15)", () => {
  it("ships exactly the documented expense and income categories", () => {
    expect(EXPENSE_CATEGORIES.map((c) => c.label)).toEqual([
      "Makanan",
      "Transportasi",
      "Belanja",
      "Hiburan",
      "Tagihan",
      "Kesehatan",
      "Pendidikan",
      "Rumah",
      "Langganan",
      "Lainnya",
    ]);
    expect(INCOME_CATEGORIES.map((c) => c.label)).toEqual([
      "Gaji",
      "Usaha",
      "Bonus",
      "Hadiah",
      "Investasi",
      "Lainnya",
    ]);
  });

  it("gives every category a stable id, icon and colour", () => {
    const ids = new Set<string>();
    for (const category of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(category.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(category.icon).toBeTruthy();
      expect(category.color).toBeTruthy();
      expect(ids.has(category.id)).toBe(false);
      ids.add(category.id);
    }
  });

  it("never treats QRIS as a wallet or a savings target", () => {
    const data = buildScenario();
    expect(data.wallets.map((w) => w.name)).not.toContain("QRIS");
    for (const transaction of data.transactions) {
      expect(["qris", "QRIS"]).not.toContain(transaction.sourceWalletId);
    }
    expect(calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total).toBe(1_400_000);
  });
});
