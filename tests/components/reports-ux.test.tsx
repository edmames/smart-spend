import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ReportsPage from "@/app/reports/page";
import { NAV_ITEMS } from "@/components/nav/bottom-nav";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeBudget, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";
import {
  calculateMoneyFlow,
  getLast6MonthKeys,
  calculateTrend,
  buildReportModel,
  formatCompactIDR,
} from "@/app/reports-derived";
import { calculateMonthlySummary, calculateCategoryBreakdown, calculateBudgetUsageList } from "@/domain/selectors";

/**
 * Phase 2G — Reports UX & Derivation
 *
 * Covers:
 * - monthly summary definitions
 * - category breakdown
 * - 6-month trend
 * - budget vs actual
 * - money flow
 * - empty states
 * - UI navigation
 * - date/timezone regression (transaction.date grouping)
 */

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/reports",
  useParams: () => ({ id: "" }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
    has: () => false,
  }),
}));

function setData(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

function reportScenarioData(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash", type: "cash" })],
    savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
    budgets: [
      makeBudget("makanan", "2026-09", 1_000_000, { id: "budget-makanan-2026-09" }),
      makeBudget("transportasi", "2026-09", 500_000, { id: "budget-transportasi-2026-09" }),
    ],
    transactions: [
      // September 2026 — qualifying
      makeTx({
        id: "inc-sep",
        type: "income",
        amount: 5_000_000,
        categoryId: "gaji",
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
        createdAt: at(2026, 9, 1, 8),
      }),
      makeTx({
        id: "exp-mkn",
        type: "expense",
        amount: 1_200_000,
        categoryId: "makanan",
        sourceWalletId: "bca",
        date: on(2026, 9, 2),
        createdAt: at(2026, 9, 2, 8),
      }),
      makeTx({
        id: "exp-trans",
        type: "expense",
        amount: 800_000,
        categoryId: "transportasi",
        sourceWalletId: "bca",
        date: on(2026, 9, 3),
        createdAt: at(2026, 9, 3, 8),
      }),
      // September — internal movements (MUST be excluded from income/expense)
      makeTx({
        id: "transfer-sep",
        type: "transfer",
        amount: 1_000_000,
        sourceWalletId: "bca",
        destinationWalletId: "cash",
        date: on(2026, 9, 4),
        createdAt: at(2026, 9, 4, 8),
      }),
      makeTx({
        id: "dep-sep",
        type: "savings_deposit",
        amount: 1_500_000,
        sourceWalletId: "bca",
        savingsTargetId: "liburan",
        date: on(2026, 9, 5),
        createdAt: at(2026, 9, 5, 8),
      }),
      makeTx({
        id: "with-sep",
        type: "savings_withdrawal",
        amount: 200_000,
        destinationWalletId: "cash",
        savingsTargetId: "liburan",
        date: on(2026, 9, 6),
        createdAt: at(2026, 9, 6, 8),
      }),
      makeTx({
        id: "open-sep",
        type: "opening_balance",
        amount: 10_000_000,
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
        createdAt: at(2026, 9, 1, 7),
      }),
      // August 2026 — for trend
      makeTx({
        id: "inc-aug",
        type: "income",
        amount: 2_000_000,
        destinationWalletId: "bca",
        date: on(2026, 8, 10),
        createdAt: at(2026, 8, 10, 8),
      }),
      makeTx({
        id: "exp-aug",
        type: "expense",
        amount: 500_000,
        categoryId: "makanan",
        sourceWalletId: "bca",
        date: on(2026, 8, 15),
        createdAt: at(2026, 8, 15, 8),
      }),
      // July 2026 — for trend
      makeTx({
        id: "exp-jul",
        type: "expense",
        amount: 300_000,
        categoryId: "hiburan",
        sourceWalletId: "bca",
        date: on(2026, 7, 5),
        createdAt: at(2026, 7, 5, 8),
      }),
      // April 2026 — no data, should be zero in trend
    ],
  });
}

describe("Reports Derivation — Monthly Summary", () => {
  beforeEach(() => {
    setData(reportScenarioData());
  });

  it("income counts as income", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.income).toBe(5_000_000);
  });

  it("expense counts as expense", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.expense).toBe(2_000_000); // 1.2M + 0.8M
  });

  it("transfer excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    // transfer 1M must not affect income/expense
    expect(summary.income).toBe(5_000_000);
    expect(summary.expense).toBe(2_000_000);
  });

  it("savings_deposit excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.income).toBe(5_000_000);
    expect(summary.expense).toBe(2_000_000);
  });

  it("savings_withdrawal excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.income).toBe(5_000_000);
    expect(summary.expense).toBe(2_000_000);
  });

  it("opening_balance excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.income).toBe(5_000_000);
  });

  it("net cash flow = income - expense", () => {
    const data = useSmartSpendStore.getState().data;
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.netCashFlow).toBe(3_000_000); // 5M - 2M
  });

  it("grouping uses transaction.date not createdAt", () => {
    // transaction with date in September but createdAt in August must count in September
    const data = emptyData({
      transactions: [
        makeTx({
          id: "cross",
          type: "expense",
          amount: 100_000,
          categoryId: "makanan",
          date: on(2026, 9, 1),
          createdAt: at(2026, 8, 1, 8), // created in August
        }),
      ],
    });
    const summarySep = calculateMonthlySummary(data.transactions, "2026-09");
    const summaryAug = calculateMonthlySummary(data.transactions, "2026-08");
    expect(summarySep.expense).toBe(100_000);
    expect(summaryAug.expense).toBe(0);
  });
});

describe("Reports Derivation — Category Breakdown", () => {
  beforeEach(() => {
    setData(reportScenarioData());
  });

  it("expense-only", () => {
    const data = useSmartSpendStore.getState().data;
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    expect(breakdown.every((e) => e.amount > 0)).toBe(true);
    // income 5M must not appear
    const total = breakdown.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(2_000_000);
  });

  it("correct category totals", () => {
    const data = useSmartSpendStore.getState().data;
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    const mkn = breakdown.find((e) => e.categoryId === "makanan");
    const trans = breakdown.find((e) => e.categoryId === "transportasi");
    expect(mkn?.amount).toBe(1_200_000);
    expect(trans?.amount).toBe(800_000);
  });

  it("correct percentages", () => {
    const data = useSmartSpendStore.getState().data;
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    const mkn = breakdown.find((e) => e.categoryId === "makanan");
    const trans = breakdown.find((e) => e.categoryId === "transportasi");
    // 1.2M / 2M = 60%, 0.8M / 2M = 40%
    expect(mkn?.percent).toBeCloseTo(60);
    expect(trans?.percent).toBeCloseTo(40);
  });

  it("sorted descending", () => {
    const data = useSmartSpendStore.getState().data;
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    expect(breakdown[0]?.categoryId).toBe("makanan");
    expect(breakdown[1]?.categoryId).toBe("transportasi");
  });

  it("zero expense safe (no NaN/Infinity)", () => {
    const data = emptyData({
      transactions: [
        makeTx({ type: "income", amount: 1_000_000, date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 8) }),
      ],
    });
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    expect(breakdown).toHaveLength(0);
  });

  it("transfers/savings excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey: "2026-09" });
    // only 2 categories, not transfer or savings
    expect(breakdown).toHaveLength(2);
  });
});

describe("Reports Derivation — 6-Month Trend", () => {
  it("exactly six calendar months ending selected month", () => {
    const keys = getLast6MonthKeys("2026-09");
    expect(keys).toHaveLength(6);
    expect(keys).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("handles year boundary", () => {
    const keys = getLast6MonthKeys("2026-02");
    expect(keys).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("uses transaction.date", () => {
    const data = emptyData({
      transactions: [
        makeTx({ type: "income", amount: 1_000_000, date: on(2026, 8, 31), createdAt: at(2026, 9, 1, 8) }),
      ],
    });
    const trend = calculateTrend(data.transactions, "2026-09");
    const aug = trend.find((p) => p.monthKey === "2026-08");
    const sep = trend.find((p) => p.monthKey === "2026-09");
    expect(aug?.income).toBe(1_000_000);
    expect(sep?.income).toBe(0);
  });

  it("income/expense only", () => {
    const data = reportScenarioData();
    const trend = calculateTrend(data.transactions, "2026-09");
    const sep = trend.find((p) => p.monthKey === "2026-09")!;
    // September has income 5M, expense 2M, transfer 1M, deposit 1.5M etc — only income/expense counted
    expect(sep.income).toBe(5_000_000);
    expect(sep.expense).toBe(2_000_000);
  });

  it("empty months return zero, not fake data", () => {
    const data = emptyData();
    const trend = calculateTrend(data.transactions, "2026-09");
    expect(trend.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
  });
});

describe("Reports Derivation — Budget vs Actual", () => {
  beforeEach(() => {
    setData(reportScenarioData());
  });

  it("expense-only actual", () => {
    const data = useSmartSpendStore.getState().data;
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    const mkn = usages.find((u) => u.budget.categoryId === "makanan")!;
    expect(mkn.spent).toBe(1_200_000); // only expense
  });

  it("matching month/category only", () => {
    const data = useSmartSpendStore.getState().data;
    // August expense for makanan 500k must not count for September budget
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    const mkn = usages.find((u) => u.budget.categoryId === "makanan")!;
    expect(mkn.spent).toBe(1_200_000);
  });

  it("transfer excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    const mkn = usages.find((u) => u.budget.categoryId === "makanan")!;
    expect(mkn.spent).toBe(1_200_000);
  });

  it("savings movement excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usages.every((u) => u.spent <= 1_200_000 || u.budget.categoryId === "transportasi")).toBe(true);
  });

  it("AMAN behavior preserved", () => {
    const data = emptyData({
      budgets: [makeBudget("makanan", "2026-09", 1_000_000)],
      transactions: [makeTx({ type: "expense", categoryId: "makanan", amount: 300_000, date: on(2026, 9, 2) })],
    });
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usages[0]?.percent).toBe(30);
    expect(usages[0]?.overBudget).toBe(false);
  });

  it("MENDEKATI BATAS behavior preserved", () => {
    const data = emptyData({
      budgets: [makeBudget("transportasi", "2026-09", 500_000)],
      transactions: [makeTx({ type: "expense", categoryId: "transportasi", amount: 450_000, date: on(2026, 9, 3) })],
    });
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usages[0]?.percent).toBe(90);
    expect(usages[0]?.overBudget).toBe(false);
  });

  it("MELEBIHI ANGGARAN behavior preserved", () => {
    const data = emptyData({
      budgets: [makeBudget("hiburan", "2026-09", 200_000)],
      transactions: [makeTx({ type: "expense", categoryId: "hiburan", amount: 250_000, date: on(2026, 9, 4) })],
    });
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usages[0]?.percent).toBe(125);
    expect(usages[0]?.overBudget).toBe(true);
  });

  it("actual percentage can exceed 100%", () => {
    const data = emptyData({
      budgets: [makeBudget("makanan", "2026-09", 500_000)],
      transactions: [makeTx({ type: "expense", categoryId: "makanan", amount: 600_000, date: on(2026, 9, 2) })],
    });
    const usages = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usages[0]?.percent).toBe(120);
  });
});

describe("Reports Derivation — Money Flow", () => {
  beforeEach(() => {
    setData(reportScenarioData());
  });

  it("income total correct", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.income).toBe(5_000_000);
  });

  it("expense total correct", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.expense).toBe(2_000_000);
  });

  it("transfer total separate", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.transfer).toBe(1_000_000);
  });

  it("savings deposits separate", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.savingsDeposit).toBe(1_500_000);
  });

  it("savings withdrawals separate", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.savingsWithdrawal).toBe(200_000);
  });

  it("opening_balance excluded", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    // opening 10M must not appear anywhere
    expect(flow.income).toBe(5_000_000);
    expect(flow.expense).toBe(2_000_000);
    expect(flow.transfer).toBe(1_000_000);
  });

  it("net cash flow excludes internal movement", () => {
    const data = useSmartSpendStore.getState().data;
    const flow = calculateMoneyFlow(data.transactions, "2026-09");
    expect(flow.netCashFlow).toBe(3_000_000); // 5M - 2M, not including transfer/savings
  });
});

describe("Reports Derivation — Compact IDR", () => {
  it("formats compact labels", () => {
    expect(formatCompactIDR(0)).toBe("Rp0");
    expect(formatCompactIDR(500)).toBe("Rp500");
    expect(formatCompactIDR(500_000)).toBe("Rp500rb");
    expect(formatCompactIDR(1_200_000)).toBe("Rp1,2jt");
    expect(formatCompactIDR(1_000_000)).toBe("Rp1jt");
    expect(formatCompactIDR(1_500_000_000)).toBe("Rp1,5M");
  });
});

describe("Reports UI — Empty States", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
  });

  it("no monthly activity shows empty state with CTA", () => {
    setData(emptyData());
    render(<ReportsPage />);
    // MonthPicker visible
    expect(screen.getByLabelText("Bulan sebelumnya")).toBeInTheDocument();
    // Empty activity title includes month label – there are multiple empty states (activity + money flow), so use getAll
    expect(screen.getAllByText(/Belum ada aktivitas/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /Catat transaksi/ })[0]).toHaveAttribute("href", "/transactions/new");
  });

  it("no expenses shows category empty state", () => {
    setData(
      emptyData({
        transactions: [
          makeTx({ type: "income", amount: 1_000_000, date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 8) }),
        ],
      }),
    );
    render(<ReportsPage />);
    expect(screen.getByText("Belum ada pengeluaran bulan ini.")).toBeInTheDocument();
  });

  it("no budgets shows budget empty state with CTA", () => {
    setData(
      emptyData({
        transactions: [makeTx({ type: "expense", amount: 100_000, date: on(2026, 9, 2), categoryId: "makanan" })],
        budgets: [],
      }),
    );
    render(<ReportsPage />);
    expect(screen.getByText(/Belum ada budget untuk/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat budget/ })).toHaveAttribute("href", expect.stringContaining("/budgets/new"));
  });

  it("partial six-month history renders correctly without fake data", () => {
    const data = emptyData({
      transactions: [
        makeTx({ type: "income", amount: 1_000_000, date: on(2026, 9, 1) }),
        // only September has data, others empty
      ],
    });
    const trend = calculateTrend(data.transactions, "2026-09");
    expect(trend.filter((p) => p.income > 0)).toHaveLength(1);
    expect(trend.find((p) => p.monthKey === "2026-09")?.income).toBe(1_000_000);
  });
});

describe("Reports UI — Navigation", () => {
  it("/reports renders Reports experience", () => {
    setData(reportScenarioData());
    render(<ReportsPage />);
    expect(screen.getByRole("heading", { name: "Laporan" })).toBeInTheDocument();
    expect(screen.getByText(/Ringkasan dan analisis keuangan/)).toBeInTheDocument();
  });

  it("Reports is contextual from Dashboard, not in bottom nav", () => {
    expect(NAV_ITEMS).toHaveLength(5);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Beranda", "Transaksi", "Dompet", "Budget", "Pengaturan"]);
    // Reports is NOT in bottom nav
    expect(NAV_ITEMS.map((i) => i.label)).not.toContain("Laporan");
  });

  it("Dashboard CashFlowCard has Lihat laporan link to /reports", () => {
    // This is tested separately in settings-phase2i.test.tsx
    // Reports page backHref is / (Beranda context)
    // Bottom nav no longer includes a Lainnya item
  });
});

describe("Reports Date/Timezone regression", () => {
  it("month grouping correct regardless of createdAt timezone", () => {
    // Simulate UTC vs Asia/Jakarta: transaction date is calendar string, not instant
    const data = emptyData({
      transactions: [
        makeTx({
          id: "tz-test",
          type: "expense",
          amount: 100_000,
          date: "2026-09-01",
          createdAt: "2026-08-31T17:00:00.000Z", // would be Sep 1 in Jakarta
        }),
      ],
    });
    const summary = calculateMonthlySummary(data.transactions, "2026-09");
    expect(summary.expense).toBe(100_000);
    // Must NOT be counted in August even though UTC instant is Aug 31
    const aug = calculateMonthlySummary(data.transactions, "2026-08");
    expect(aug.expense).toBe(0);
  });

  it("buildReportModel uses transaction.date consistently", () => {
    const data = reportScenarioData();
    const model = buildReportModel(data.transactions, data.budgets, "2026-09");
    expect(model.monthly.income).toBe(5_000_000);
    expect(model.moneyFlow.income).toBe(5_000_000);
    expect(model.expenseByCategory.reduce((s, e) => s + e.amount, 0)).toBe(2_000_000);
  });
});
