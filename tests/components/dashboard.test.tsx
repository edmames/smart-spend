import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DashboardPage from "@/app/page";
import { TotalMoneyCard } from "@/components/summary/summary";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { maskMoney } from "@/components/settings/money-mask";
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

    const hub = screen.getByRole("region", { name: "Dompet & Tabungan" });
    expect(within(hub).getByText("BCA")).toBeInTheDocument();
    expect(within(hub).getAllByText("Bank").length).toBeGreaterThanOrEqual(1);
    expect(within(hub).getByText("Rp10.250.000")).toBeInTheDocument();
    expect(within(hub).getByText("Cash")).toBeInTheDocument();
    expect(within(hub).getByText("Tunai")).toBeInTheDocument();
    expect(within(hub).getByText("Rp1.200.000")).toBeInTheDocument();
    expect(within(hub).getByText("Jago")).toBeInTheDocument();
    expect(within(hub).getByRole("link", { name: /Kelola/i })).toHaveAttribute("href", "/wallets");
    expect(within(hub).getByRole("link", { name: /BCA/ })).toHaveAttribute("href", "/wallets/bca");
  });

  it("uses semantic hero styling instead of white text on the shared surface card", () => {
    render(<TotalMoneyCard total={1_000_000} walletTotal={1_000_000} savingsTotal={0} />);

    const hero = screen.getByText("Total uang Anda").closest("section");
    expect(hero).toHaveClass("total-money-hero");
    expect(hero).not.toHaveClass("bg-surface");
    expect(hero).not.toHaveClass("text-white");
    expect(screen.getAllByText("Rp1.000.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Rp0")).toBeInTheDocument();
  });

  it("keeps internal movements and opening balance out of the month summary", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    expect(screen.getByText("+Rp1.750.000")).toBeInTheDocument();
    expect(screen.getByText("surplus")).toBeInTheDocument();
    expect(screen.getByText("Rp2.500.000")).toBeInTheDocument();
    expect(screen.getAllByText("Rp750.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1 transaksi")).toHaveLength(2);
    expect(screen.getByText(/transfer, tabungan, dan saldo awal dikecualikan/i)).toBeInTheDocument();
  });

  it("shows savings progress from existing derived data", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const hub = screen.getByRole("region", { name: "Dompet & Tabungan" });
    expect(within(hub).getByText("Liburan")).toBeInTheDocument();
    expect(within(hub).getByText("Rp800.000")).toBeInTheDocument();
    expect(within(hub).getByText("16%")).toBeInTheDocument();
    expect(within(hub).getByText("Target Rp5.000.000")).toBeInTheDocument();
    expect(within(hub).getByRole("link", { name: /Liburan/ })).toHaveAttribute("href", "/savings/liburan");
  });

  it("keeps the transaction create route reachable and shows recent transactions earlier", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    expect(screen.getByRole("link", { name: /Tambah Transaksi/i })).toHaveAttribute("href", "/transactions/new");
    const recentSection = screen.getByRole("region", { name: "Transaksi terakhir" });
    expect(within(recentSection).getAllByText("Setoran Tabungan").length).toBeGreaterThanOrEqual(1);
    expect(within(recentSection).getAllByText("Transfer").length).toBeGreaterThanOrEqual(1);
    expect(within(recentSection).getByText("Belanja pasar")).toBeInTheDocument();
    expect(within(recentSection).getByRole("link", { name: /Semua/i })).toHaveAttribute("href", "/transactions");
    // Only the newest four records belong in the feed preview.
    expect(within(recentSection).queryByText("Gaji")).not.toBeInTheDocument();
  });

  it("exposes the four dashboard destinations without inventing new flows", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const quickActions = screen.getByRole("region", { name: "Aksi cepat" });
    const links = within(quickActions).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/transactions/new",
      "/transactions/new?kind=transfer",
      "/wallets",
      "/reports",
    ]);
  });

  it("orders the recent feed by the canonical ledger ordering, not by createdAt alone", () => {
    setDashboardData(
      emptyData({
        wallets: [makeWallet("cash", { name: "Cash", type: "cash" })],
        transactions: [
          makeTx({
            id: "older",
            type: "income",
            amount: 100_000,
            destinationWalletId: "cash",
            note: "Catatan lama",
            date: on(2026, 9, 10),
            createdAt: at(2026, 9, 10, 8),
          }),
          makeTx({
            id: "newer",
            type: "income",
            amount: 200_000,
            destinationWalletId: "cash",
            note: "Catatan baru",
            date: on(2026, 9, 10),
            createdAt: at(2026, 9, 10, 9),
          }),
        ],
      }),
    );
    render(<DashboardPage />);

    const recentSection = screen.getByRole("region", { name: "Transaksi terakhir" });
    const labels = within(recentSection)
      .getAllByRole("link")
      .map((link) => link.textContent ?? "");
    const newer = labels.findIndex((text) => text.includes("Catatan baru"));
    const older = labels.findIndex((text) => text.includes("Catatan lama"));

    expect(newer).toBeGreaterThanOrEqual(0);
    expect(older).toBeGreaterThanOrEqual(0);
    expect(newer).toBeLessThan(older);
  });

  it("masks every balance surface when hideBalances is on", () => {
    setDashboardData(realisticData());
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: /Tampilkan nominal/i })).toBeInTheDocument();
    expect(screen.queryByText("Rp12.250.000")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp10.250.000")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp2.500.000")).not.toBeInTheDocument();
    expect(screen.getAllByText(maskMoney()).length).toBeGreaterThanOrEqual(4);
  });

  it("renders the largest supported IDR value without breaking the hero", () => {
    setDashboardData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        transactions: [
          makeTx({
            id: "open-max",
            type: "opening_balance",
            amount: 9_999_999_999,
            destinationWalletId: "bca",
            date: on(2026, 9, 1),
            createdAt: at(2026, 9, 1, 8),
          }),
        ],
      }),
    );
    render(<DashboardPage />);

    expect(screen.getAllByText("Rp9.999.999.999").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the feed and the reports bridge useful before the first transaction", () => {
    setDashboardData(emptyData({ wallets: [makeWallet("cash", { name: "Cash", type: "cash" })] }));
    render(<DashboardPage />);

    const recentSection = screen.getByRole("region", { name: "Transaksi terakhir" });
    expect(within(recentSection).getByText("Belum ada transaksi yang dicatat.")).toBeInTheDocument();
    expect(within(recentSection).getByRole("link", { name: /Catat transaksi/i })).toHaveAttribute(
      "href",
      "/transactions/new",
    );

    const bridge = screen.getByRole("region", { name: "Pola pengeluaran" });
    expect(within(bridge).getByText(/Belum ada pengeluaran bulan ini/i)).toBeInTheDocument();
    expect(within(bridge).getByRole("link", { name: /Buka laporan/i })).toHaveAttribute("href", "/reports");
  });

  it("summarises several wallets with a route to the money hub", () => {
    setDashboardData(
      emptyData({
        wallets: [
          makeWallet("w1", { name: "Dompet 1" }),
          makeWallet("w2", { name: "Dompet 2" }),
          makeWallet("w3", { name: "Dompet 3" }),
          makeWallet("w4", { name: "Dompet 4" }),
          makeWallet("w5", { name: "Dompet 5" }),
        ],
      }),
    );
    render(<DashboardPage />);

    const hub = screen.getByRole("region", { name: "Dompet & Tabungan" });
    expect(within(hub).getByText("Dompet 1")).toBeInTheDocument();
    expect(within(hub).getByText("Dompet 3")).toBeInTheDocument();
    expect(within(hub).queryByText("Dompet 4")).not.toBeInTheDocument();
    expect(within(hub).getByRole("link", { name: /2 dompet lain/i })).toHaveAttribute("href", "/wallets");
  });

  it("shows the top expense category in the reports bridge", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const bridge = screen.getByRole("region", { name: "Pola pengeluaran" });
    expect(within(bridge).getByText(/Pengeluaran terbesar bulan ini/i)).toBeInTheDocument();
    expect(within(bridge).getByText("Makanan")).toBeInTheDocument();
    expect(within(bridge).getByRole("link", { name: /Buka laporan/i })).toHaveAttribute("href", "/reports");
  });

  it("reads total money and this month as one hero overview", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const hero = screen.getByText("Total uang Anda").closest("section");
    expect(hero).not.toBeNull();
    expect(hero).toHaveClass("total-money-hero");
    // The monthly strip lives inside the same surface — one overview, not two cards.
    expect(within(hero!).getByRole("heading", { name: "Bulan ini" })).toBeInTheDocument();
    expect(within(hero!).getByText("September 2026")).toBeInTheDocument();
    expect(within(hero!).getByText("+Rp1.750.000")).toBeInTheDocument();
    // The derivation of the total stays visible next to the headline figure.
    expect(within(hero!).getByText("Rp11.450.000")).toBeInTheDocument();
    expect(within(hero!).getByText("Rp800.000")).toBeInTheDocument();
  });

  it("never signs a transfer or a savings movement as income or expense in the feed", () => {
    setDashboardData(realisticData());
    render(<DashboardPage />);

    const recent = screen.getByRole("region", { name: "Transaksi terakhir" });
    // A real expense keeps its expense sign…
    expect(within(recent).getByText("-Rp750.000")).toBeInTheDocument();
    // …while an internal movement is shown unsigned, with its own type badge.
    expect(within(recent).getByText("Rp500.000")).toBeInTheDocument();
    expect(within(recent).queryByText("+Rp500.000")).not.toBeInTheDocument();
    expect(within(recent).queryByText("-Rp500.000")).not.toBeInTheDocument();
    expect(within(recent).getByText("Rp1.000.000")).toBeInTheDocument();
    expect(within(recent).queryByText("+Rp1.000.000")).not.toBeInTheDocument();
  });

  it("never signs an opening balance as income in the feed", () => {
    setDashboardData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        transactions: [
          makeTx({
            id: "open-bca",
            type: "opening_balance",
            amount: 3_000_000,
            destinationWalletId: "bca",
            date: on(2026, 9, 1),
            createdAt: at(2026, 9, 1, 8),
          }),
        ],
      }),
    );
    render(<DashboardPage />);

    const recent = screen.getByRole("region", { name: "Transaksi terakhir" });
    expect(within(recent).getByText("Rp3.000.000")).toBeInTheDocument();
    expect(within(recent).queryByText("+Rp3.000.000")).not.toBeInTheDocument();
    expect(within(recent).getAllByText("Saldo Awal").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the recent feed masked while balances are hidden", () => {
    setDashboardData(realisticData());
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });
    render(<DashboardPage />);

    const recent = screen.getByRole("region", { name: "Transaksi terakhir" });
    expect(within(recent).queryByText("Rp500.000")).not.toBeInTheDocument();
    expect(within(recent).queryByText("-Rp750.000")).not.toBeInTheDocument();
    expect(within(recent).getAllByText(maskMoney()).length).toBeGreaterThanOrEqual(4);
  });
});
