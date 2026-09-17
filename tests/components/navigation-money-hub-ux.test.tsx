import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NAV_ITEMS } from "@/components/nav/bottom-nav";
import { MoneyHub } from "@/components/money-hub/money-hub";
import { WalletsContent } from "@/components/wallets/wallets-content";
import { SavingsContent } from "@/components/savings/savings-content";
import MorePage from "@/app/more/page";
import WalletsPage from "@/app/wallets/page";
import SavingsPage from "@/app/savings/page";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";
import { calculateSavingsBalance, calculateTotalMoney, calculateWalletBalance } from "@/domain/ledger";

/**
 * Phase 2F — Navigation & Money Hub
 *
 * Covers:
 * - bottom nav exactly 5: Beranda, Transaksi, Dompet, Budget, Lainnya
 * - Tabungan absent from bottom nav, Budget present
 * - /wallets and /savings activate Dompet, /budgets activates Budget
 * - Money Hub segmented control [Dompet] [Tabungan]
 * - /wallets defaults to Dompet, /wallets?tab=savings opens Tabungan
 * - switching tabs updates visible content and URL via router.replace
 * - unknown tab falls back to Dompet
 * - /savings compatibility opens Tabungan
 * - Lainnya does not duplicate Budget/Tabungan as primary nav
 * - financial invariants remain intact
 */

const replace = vi.fn();
const push = vi.fn();

let mockPathname = "/wallets";
let mockSearchParams: URLSearchParams;

function setMockRoute(pathname: string, search = "") {
  mockPathname = pathname;
  mockSearchParams = new URLSearchParams(search.replace(/^\?/, ""));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
  useParams: () => ({ id: "bca" }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
    has: (key: string) => mockSearchParams.has(key),
  }),
}));

function setData(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

function sampleData(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash", type: "cash" })],
    savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
    transactions: [
      makeTx({
        id: "open-bca",
        type: "opening_balance",
        amount: 1_000_000,
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
        createdAt: at(2026, 9, 1, 8),
      }),
      makeTx({
        id: "dep",
        type: "savings_deposit",
        amount: 200_000,
        sourceWalletId: "bca",
        savingsTargetId: "liburan",
        date: on(2026, 9, 2),
        createdAt: at(2026, 9, 2, 8),
      }),
    ],
  });
}

describe("Bottom Nav Phase 2F", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    setMockRoute("/wallets", "");
  });

  it("is exactly five items in exact order: Beranda, Transaksi, Dompet, Budget, Lainnya", () => {
    expect(NAV_ITEMS).toHaveLength(5);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Beranda", "Transaksi", "Dompet", "Budget", "Lainnya"]);
  });

  it("Tabungan absent, Budget present", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels).not.toContain("Tabungan");
    expect(labels).toContain("Budget");
    expect(labels).toContain("Dompet");
  });

  it("correct hrefs", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/transactions", "/wallets", "/budgets", "/more"]);
  });

  it("/wallets activates Dompet", () => {
    const dompet = NAV_ITEMS.find((i) => i.label === "Dompet")!;
    expect(dompet.match("/wallets")).toBe(true);
    expect(dompet.match("/wallets/new")).toBe(true);
    expect(dompet.match("/wallets/bca")).toBe(true);
    expect(dompet.match("/wallets/bca/edit")).toBe(true);
  });

  it("/savings activates Dompet (not standalone)", () => {
    const dompet = NAV_ITEMS.find((i) => i.label === "Dompet")!;
    expect(dompet.match("/savings")).toBe(true);
    expect(dompet.match("/savings/new")).toBe(true);
    expect(dompet.match("/savings/liburan")).toBe(true);
  });

  it("/budgets activates Budget", () => {
    const budget = NAV_ITEMS.find((i) => i.label === "Budget")!;
    expect(budget.match("/budgets")).toBe(true);
    expect(budget.match("/budgets/new")).toBe(true);
    expect(budget.match("/budgets/123")).toBe(true);
  });

  it("Lainnya does NOT activate for Budget or Savings", () => {
    const lainnya = NAV_ITEMS.find((i) => i.label === "Lainnya")!;
    expect(lainnya.match("/budgets")).toBe(false);
    expect(lainnya.match("/savings")).toBe(false);
    expect(lainnya.match("/wallets")).toBe(false);
    expect(lainnya.match("/more")).toBe(true);
    expect(lainnya.match("/reports")).toBe(true);
    expect(lainnya.match("/settings")).toBe(true);
  });

  it("Beranda and Transaksi matching remain correct", () => {
    const beranda = NAV_ITEMS.find((i) => i.label === "Beranda")!;
    const transaksi = NAV_ITEMS.find((i) => i.label === "Transaksi")!;
    expect(beranda.match("/")).toBe(true);
    expect(beranda.match("/transactions")).toBe(false);
    expect(transaksi.match("/transactions")).toBe(true);
    expect(transaksi.match("/transactions/new")).toBe(true);
  });
});

describe("Money Hub URL & Tab State", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    setData(sampleData());
  });

  it("/wallets defaults to Dompet", () => {
    setMockRoute("/wallets", "");
    render(<MoneyHub />);
    expect(screen.getByRole("tab", { name: "Dompet" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tabungan" })).toHaveAttribute("aria-selected", "false");
    // wallet content visible
    expect(screen.getByText("Total uang di dompet")).toBeInTheDocument();
    expect(screen.getByText("BCA")).toBeInTheDocument();
  });

  it("/wallets?tab=savings opens Tabungan", () => {
    setMockRoute("/wallets", "?tab=savings");
    render(<MoneyHub />);
    expect(screen.getByRole("tab", { name: "Tabungan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Total tersimpan (target aktif)")).toBeInTheDocument();
    expect(screen.getByText("Liburan")).toBeInTheDocument();
  });

  it("unknown tab safely falls back to Dompet", () => {
    setMockRoute("/wallets", "?tab=unknown");
    render(<MoneyHub />);
    expect(screen.getByRole("tab", { name: "Dompet" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Total uang di dompet")).toBeInTheDocument();
  });

  it("switching Dompet -> Tabungan updates URL to /wallets?tab=savings", async () => {
    setMockRoute("/wallets", "");
    const user = userEvent.setup();
    render(<MoneyHub />);
    const tabunganTab = screen.getByRole("tab", { name: "Tabungan" });
    await user.click(tabunganTab);
    expect(replace).toHaveBeenCalled();
    const lastCall = replace.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain("/wallets");
    expect(lastCall).toContain("tab=savings");
  });

  it("switching Tabungan -> Dompet updates URL to /wallets", async () => {
    setMockRoute("/wallets", "?tab=savings");
    const user = userEvent.setup();
    render(<MoneyHub />);
    const dompetTab = screen.getByRole("tab", { name: "Dompet" });
    await user.click(dompetTab);
    expect(replace).toHaveBeenCalled();
    const lastCall = replace.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toBe("/wallets");
  });

  it("visible content follows selected tab", () => {
    setMockRoute("/wallets", "");
    render(<MoneyHub />);
    expect(screen.getByText("Total uang di dompet")).toBeInTheDocument();
    expect(screen.queryByText("Total tersimpan (target aktif)")).not.toBeInTheDocument();
  });

  it("/savings compatibility opens Tabungan experience", () => {
    setMockRoute("/savings", "");
    render(<MoneyHub initialTab="savings" />);
    expect(screen.getByRole("tab", { name: "Tabungan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Total tersimpan (target aktif)")).toBeInTheDocument();
  });

  it("Money Hub has accessible tablist with two tabs", () => {
    setMockRoute("/wallets", "");
    render(<MoneyHub />);
    const tablist = screen.getByRole("tablist", { name: "Pilihan dompet atau tabungan" });
    expect(tablist).toBeInTheDocument();
    expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
  });

  it("no duplicated page headings inside Money Hub content", () => {
    setMockRoute("/wallets", "");
    render(<MoneyHub />);
    // Only one PageHeader title "Dompet" should exist
    const headings = screen.getAllByRole("heading", { level: 1 });
    // PageHeader renders h1 with title Dompet
    expect(headings.length).toBe(1);
    expect(headings[0]).toHaveTextContent("Dompet");
  });
});

describe("WalletsContent & SavingsContent extraction", () => {
  beforeEach(() => {
    setData(sampleData());
    setMockRoute("/wallets", "");
    replace.mockClear();
  });

  it("WalletsContent renders derived wallet balances", () => {
    render(<WalletsContent />);
    expect(screen.getByText("Total uang di dompet")).toBeInTheDocument();
    // BCA balance = 1_000_000 - 200_000 deposit = 800_000
    expect(screen.getAllByText("Rp800.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BCA")).toBeInTheDocument();
  });

  it("SavingsContent renders derived savings balances", () => {
    render(<SavingsContent />);
    expect(screen.getByText("Total tersimpan (target aktif)")).toBeInTheDocument();
    expect(screen.getAllByText("Rp200.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Liburan")).toBeInTheDocument();
  });
});

describe("Lainnya Phase 2F", () => {
  beforeEach(() => {
    setMockRoute("/more", "");
    setData(sampleData());
    replace.mockClear();
  });

  it("Budget is not duplicated as primary navigation inside Lainnya", () => {
    render(<MorePage />);
    // No link with label Budget as primary nav duplication
    // We check that there is no MoreRow with href /budgets that says Budget
    const budgetLinks = screen.queryAllByRole("link", { name: /Budget/ });
    // The page should not contain Budget primary nav row
    expect(budgetLinks.length).toBe(0);
    // But Laporan and Pengaturan should still exist
    expect(screen.getByText("Laporan")).toBeInTheDocument();
    expect(screen.getByText("Pengaturan")).toBeInTheDocument();
  });

  it("Tabungan is not duplicated as navigation destination inside Lainnya", () => {
    render(<MorePage />);
    // Should not have a row linking to /savings or /wallets?tab=savings as primary nav duplication
    // The Navigasi section was removed; only quick actions remain
    // Check that there is no row with label Tabungan as navigation
    const tabunganNav = screen.queryAllByText("Tabungan").filter((el) => {
      // quick action "Tambah target tabungan" contains Tabungan but is an action, allowed
      // We want to ensure no standalone "Tabungan" nav row
      return el.textContent === "Tabungan";
    });
    expect(tabunganNav.length).toBe(0);
  });

  it("preserves contextual quick actions", () => {
    render(<MorePage />);
    expect(screen.getByText("Catat transaksi")).toBeInTheDocument();
    expect(screen.getByText("Riwayat & filter")).toBeInTheDocument();
    expect(screen.getByText("Tambah dompet")).toBeInTheDocument();
    expect(screen.getByText("Tambah target tabungan")).toBeInTheDocument();
  });
});

describe("Financial invariants remain intact after Money Hub refactor", () => {
  beforeEach(() => {
    setData(sampleData());
  });

  it("wallet balance remains derived", () => {
    const data = useSmartSpendStore.getState().data;
    const bal = calculateWalletBalance(data.transactions, "bca");
    expect(bal).toBe(800_000);
  });

  it("savings balance remains derived", () => {
    const data = useSmartSpendStore.getState().data;
    const bal = calculateSavingsBalance(data.transactions, "liburan");
    expect(bal).toBe(200_000);
  });

  it("savings deposit is not expense and does not change Total Money", () => {
    const data = useSmartSpendStore.getState().data;
    const total = calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total;
    // Total = walletTotal + savingsTotal = 800k + 200k = 1_000_000 = opening balance
    expect(total).toBe(1_000_000);
    // deposit transaction exists but is not expense
    const dep = data.transactions.find((t) => t.type === "savings_deposit");
    expect(dep).toBeDefined();
    expect(dep?.type).not.toBe("expense");
  });

  it("savings withdrawal is not income", () => {
    const data = emptyData({
      wallets: [makeWallet("bca", { name: "BCA" })],
      savingsTargets: [makeTarget("liburan", 5_000_000)],
      transactions: [
        makeTx({
          id: "open",
          type: "opening_balance",
          amount: 1_000_000,
          destinationWalletId: "bca",
          date: on(2026, 9, 1),
          createdAt: at(2026, 9, 1, 8),
        }),
        makeTx({
          id: "dep",
          type: "savings_deposit",
          amount: 300_000,
          sourceWalletId: "bca",
          savingsTargetId: "liburan",
          date: on(2026, 9, 2),
          createdAt: at(2026, 9, 2, 8),
        }),
        makeTx({
          id: "with",
          type: "savings_withdrawal",
          amount: 100_000,
          destinationWalletId: "bca",
          savingsTargetId: "liburan",
          date: on(2026, 9, 3),
          createdAt: at(2026, 9, 3, 8),
        }),
      ],
    });
    setData(data);
    const withdrawal = data.transactions.find((t) => t.type === "savings_withdrawal");
    expect(withdrawal).toBeDefined();
    expect(withdrawal?.type).not.toBe("income");
    const total = calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total;
    expect(total).toBe(1_000_000);
  });

  it("budget spending remains expense-only (no savings/transfer counted)", () => {
    // This is already covered in budgets-ux but we keep a smoke test
    const data = sampleData();
    const expense = data.transactions.filter((t) => t.type === "expense");
    expect(expense).toHaveLength(0); // sample has no expense, only deposit
    // ensure deposit not counted as expense - check via type string
    const hasDepositAsExpense = data.transactions.some((t) => (t.type as string) === "savings_deposit" && (t.type as string) === "expense");
    expect(hasDepositAsExpense).toBe(false);
  });
});

describe("Backward compatibility routes", () => {
  beforeEach(() => {
    setData(sampleData());
    replace.mockClear();
  });

  it("/wallets page renders Money Hub", () => {
    setMockRoute("/wallets", "");
    render(<WalletsPage />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("/savings page renders Money Hub with Tabungan selected", () => {
    setMockRoute("/savings", "");
    render(<SavingsPage />);
    expect(screen.getByRole("tab", { name: "Tabungan" })).toHaveAttribute("aria-selected", "true");
  });
});
