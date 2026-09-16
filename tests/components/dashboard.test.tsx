import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DashboardPage from "@/app/page";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";

function setDashboardData(data: PersistedData, hydrated = true) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: hydrated ? "ready" : "idle" });
}

function realisticData(): PersistedData {
  return emptyData({
    wallets: [
      makeWallet("bca", { name: "BCA" }),
      makeWallet("cash", { name: "Cash", type: "cash" }),
      makeWallet("jago", { name: "Jago" }),
    ],
    savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
    transactions: [
      makeTx({
        id: "open-bca",
        type: "opening_balance",
        amount: 10_000_000,
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
        createdAt: at(2026, 9, 1, 8),
      }),
      makeTx({
        id: "open-cash",
        type: "opening_balance",
        amount: 500_000,
        destinationWalletId: "cash",
        date: on(2026, 9, 1),
        createdAt: at(2026, 9, 1, 9),
      }),
      makeTx({
        id: "income",
        type: "income",
        amount: 2_500_000,
        destinationWalletId: "bca",
        categoryId: "gaji",
        note: "Gaji",
        date: on(2026, 9, 2),
        createdAt: at(2026, 9, 2, 8),
      }),
      makeTx({
        id: "expense",
        type: "expense",
        amount: 750_000,
        sourceWalletId: "bca",
        categoryId: "makanan",
        note: "Belanja pasar",
        date: on(2026, 9, 3),
        createdAt: at(2026, 9, 3, 8),
      }),
      makeTx({
        id: "transfer",
        type: "transfer",
        amount: 500_000,
        sourceWalletId: "bca",
        destinationWalletId: "cash",
        date: on(2026, 9, 4),
        createdAt: at(2026, 9, 4, 8),
      }),
      makeTx({
        id: "deposit",
        type: "savings_deposit",
        amount: 1_000_000,
        sourceWalletId: "bca",
        savingsTargetId: "liburan",
        date: on(2026, 9, 5),
        createdAt: at(2026, 9, 5, 8),
      }),
      makeTx({
        id: "withdrawal",
        type: "savings_withdrawal",
        amount: 200_000,
        destinationWalletId: "cash",
        savingsTargetId: "liburan",
        date: on(2026, 9, 6),
        createdAt: at(2026, 9, 6, 8),
      }),
    ],
  });
}

describe("Dashboard Phase 2B", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T04:00:00.000Z"));
    setDashboardData(emptyData());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one compact empty state with wallet-first onboarding", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Mulai dari dompet pertama" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat dompet/i })).toHaveAttribute("href", "/wallets/new");
    expect(screen.getByRole("button", { name: /Catat transaksi/i })).toBeDisabled();
    expect(screen.getByText(/Catat transaksi aktif setelah ada dompet/i)).toBeInTheDocument();
    expect(screen.queryByText("Langkah awal")).not.toBeInTheDocument();
    expect(screen.queryByText("Belum ada yang dicatat")).not.toBeInTheDocument();
  });

  it("shows an intentional hydration skeleton without misleading financial values", () => {
    setDashboardData(realisticData(), false);
    render(<DashboardPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Memuat ringkasan keuangan...");
    expect(screen.queryByText("Rp0")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp0.000")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp12.250.000")).not.toBeInTheDocument();
  });

  it("renders total money as wallets plus savings and previews multiple wallets", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    expect(screen.getByText("Total uang Anda")).toBeInTheDocument();
    expect(screen.getByText("Rp12.250.000")).toBeInTheDocument();
    expect(screen.getAllByText("Rp11.450.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rp800.000").length).toBeGreaterThanOrEqual(1);

    const walletSection = screen.getByRole("region", { name: "Di mana uang Anda" });
    expect(within(walletSection).getByText("BCA")).toBeInTheDocument();
    expect(within(walletSection).getByText("Rp10.250.000")).toBeInTheDocument();
    expect(within(walletSection).getByText("Cash")).toBeInTheDocument();
    expect(within(walletSection).getByText("Rp1.200.000")).toBeInTheDocument();
    expect(within(walletSection).getByText("Jago")).toBeInTheDocument();
    expect(within(walletSection).getByRole("link", { name: /Semua dompet/i })).toHaveAttribute("href", "/wallets");
  });

  it("keeps internal movements and opening balance out of the month summary", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    expect(screen.getByText("Net Rp1.750.000")).toBeInTheDocument();
    expect(screen.getByText("Rp2.500.000")).toBeInTheDocument();
    expect(screen.getAllByText("Rp750.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1 transaksi")).toHaveLength(2);
    expect(screen.getByText(/transfer, tabungan, dan saldo awal dikecualikan/i)).toBeInTheDocument();
  });

  it("shows savings progress from existing derived data", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const savingsSection = screen.getByRole("region", { name: "Tabungan" });
    expect(within(savingsSection).getByText("Liburan")).toBeInTheDocument();
    expect(within(savingsSection).getByText("Rp800.000")).toBeInTheDocument();
    expect(within(savingsSection).getByText("16%")).toBeInTheDocument();
    expect(within(savingsSection).getByText("Target Rp5.000.000")).toBeInTheDocument();
  });

  it("keeps the transaction create route reachable and shows recent transactions earlier", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: /^Catat$/i })).toHaveAttribute("href", "/transactions/new");
    const recentSection = screen.getByRole("region", { name: "Transaksi terakhir" });
    expect(within(recentSection).getAllByText("Setoran Tabungan").length).toBeGreaterThanOrEqual(1);
    expect(within(recentSection).getAllByText("Transfer").length).toBeGreaterThanOrEqual(1);
    expect(within(recentSection).getByText("Belanja pasar")).toBeInTheDocument();
    expect(within(recentSection).getByRole("link", { name: /Semua/i })).toHaveAttribute("href", "/transactions");
  });
});
