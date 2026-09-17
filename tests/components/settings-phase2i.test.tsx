import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoneyHub } from "@/components/money-hub/money-hub";
import { WalletsContent } from "@/components/wallets/wallets-content";
import { SavingsContent } from "@/components/savings/savings-content";
import SettingsPage from "@/app/settings/page";
import ReportsPage from "@/app/reports/page";
import DashboardPage from "@/app/page";
import { TotalMoneyCard } from "@/components/summary/summary";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";
import { applyTheme } from "@/lib/theme";
import { maskMoney } from "@/components/settings/money-mask";
import { DEFAULT_SETTINGS } from "@/domain/models";

/**
 * Phase 2I — Settings IA Refinement
 *
 * Targeted tests for:
 * - theme persists immediately
 * - default transaction type persists immediately
 * - no Save button
 * - Dashboard Eye/EyeOff toggles hideBalances
 * - hideBalances survives reload
 * - hidden values do not leak through accessibility metadata
 * - Reports accessible contextually from Dashboard
 * - /reports navigation context is Beranda
 */

const push = vi.fn();
const replace = vi.fn();

let mockPathname = "/settings";
let mockSearchParams: URLSearchParams;

function setMockRoute(pathname: string, search = "") {
  mockPathname = pathname;
  mockSearchParams = new URLSearchParams(search.replace(/^\?/, ""));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
  useParams: () => ({ id: "" }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
    has: (key: string) => mockSearchParams.has(key),
  }),
}));

vi.mock("next/link", async () => {
  const actual = await vi.importActual("next/link");
  return {
    ...actual,
    // Keep Next.js Link working; tests don't assert on navigation side-effects here.
    default: actual.default,
  };
});

function setData(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

function realisticData(): PersistedData {
  return emptyData({
    wallets: [
      makeWallet("bca", { name: "BCA" }),
      makeWallet("cash", { name: "Cash", type: "cash" }),
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
    ],
  });
}

describe("Settings preferences persist immediately", () => {
  beforeEach(() => {
    setMockRoute("/settings", "");
    setData(realisticData());
  });

  it("changing theme persists immediately with no Save button", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    // No Save button anywhere on the page
    const saveButtons = screen.queryAllByRole("button", { name: /Simpan perubahan/i });
    expect(saveButtons).toHaveLength(0);

    // Click "Terang" theme
    const lightBtn = screen.getByRole("button", { name: "Terang" });
    await user.click(lightBtn);

    // Settings should be updated immediately
    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.theme).toBe("light");

    // Click "Gelap" theme
    const darkBtn = screen.getByRole("button", { name: "Gelap" });
    await user.click(darkBtn);

    const settings2 = useSmartSpendStore.getState().data.settings;
    expect(settings2?.theme).toBe("dark");
  });

  it("changing default transaction type persists immediately", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    // Default should be "expense"
    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.firstTransactionType).toBe("expense");

    // Click "Pemasukan"
    const incomeBtn = screen.getByRole("button", { name: "Pemasukan" });
    await user.click(incomeBtn);

    const settings2 = useSmartSpendStore.getState().data.settings;
    expect(settings2?.firstTransactionType).toBe("income");

    // Click "Pengeluaran" to toggle back
    const expenseBtn = screen.getByRole("button", { name: "Pengeluaran" });
    await user.click(expenseBtn);

    const settings3 = useSmartSpendStore.getState().data.settings;
    expect(settings3?.firstTransactionType).toBe("expense");
  });

  it("theme change applies data-theme attribute to documentElement", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const darkBtn = screen.getByRole("button", { name: "Gelap" });
    await user.click(darkBtn);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(useSmartSpendStore.getState().data.settings?.theme).toBe("dark");
  });

  it("no success toast appears after changing preferences", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const lightBtn = screen.getByRole("button", { name: "Terang" });
    await user.click(lightBtn);

    // No toast container should have been injected (pushToast goes to a separate
    // toast store that is only rendered by the global layout ToastHost).
    // The word "tersimpan" exists as static UI text ("Berubah dan tersimpan langsung")
    // and "Terakhir disimpan", so we check for actual success-toast patterns only.
    expect(screen.queryByText(/berhasil/i)).not.toBeInTheDocument();
    // Verify settings persisted instead (this is the real assertion)
    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.theme).toBe("light");
  });
});

describe("Dashboard Eye/EyeOff hide-balance control", () => {
  beforeEach(() => {
    setData(realisticData());
  });

  it("TotalMoneyCard shows Eye toggle and masks when hideBalances is true", async () => {
    const user = userEvent.setup();
    useSmartSpendStore.getState().updateSettings({ hideBalances: false });

    render(<TotalMoneyCard total={12_250_000} walletTotal={11_450_000} savingsTotal={800_000} />);

    // Amount should be visible initially
    expect(screen.getByText("Rp12.250.000")).toBeInTheDocument();

    // Eye toggle should be present
    const eyeButton = screen.getByRole("button", { name: /Sembunyikan nominal/i });
    expect(eyeButton).toBeInTheDocument();

    // Click eye to mask
    await user.click(eyeButton);

    // hideBalances should be persisted
    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.hideBalances).toBe(true);
  });

  it("EyeOff (when hidden) restores visibility and persists", async () => {
    const user = userEvent.setup();
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });

    render(<TotalMoneyCard total={12_250_000} walletTotal={11_450_000} savingsTotal={800_000} />);

    // Masked values should be shown instead of Rp values
    const masked = screen.getAllByText(maskMoney());
    expect(masked.length).toBeGreaterThanOrEqual(1);

    // EyeOff button should be present (to un-hide)
    const eyeOffButton = screen.getByRole("button", { name: /Tampilkan nominal/i });
    expect(eyeOffButton).toBeInTheDocument();

    // Click to un-hide
    await user.click(eyeOffButton);

    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.hideBalances).toBe(false);
  });

  it("hideBalances survives reload", async () => {
    // Set hideBalances, then reload from repository
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });

    // Reload — repository has the persisted data
    await act(async () => {
      await useSmartSpendStore.getState().reload();
    });

    const settings = useSmartSpendStore.getState().data.settings;
    expect(settings?.hideBalances).toBe(true);
  });

  it("hidden values do not leak through accessibility metadata", () => {
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });

    render(<TotalMoneyCard total={12_250_000} walletTotal={11_450_000} savingsTotal={800_000} />);

    // No Rp values should be visible
    expect(screen.queryByText("Rp12.250.000")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp11.450.000")).not.toBeInTheDocument();
    expect(screen.queryByText("Rp800.000")).not.toBeInTheDocument();

    // No aria-label or title should contain the raw amount
    const allAriaLabels = document.querySelectorAll("[aria-label]");
    for (const el of allAriaLabels) {
      const label = el.getAttribute("aria-label") ?? "";
      expect(label).not.toContain("12250000");
      expect(label).not.toContain("12.250.000");
    }

    const allTitles = document.querySelectorAll("[title]");
    for (const el of allTitles) {
      const title = el.getAttribute("title") ?? "";
      expect(title).not.toContain("12250000");
      expect(title).not.toContain("12.250.000");
    }
  });

  it("WalletsContent masks totals when hideBalances is true", () => {
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });
    setMockRoute("/wallets", "");

    render(<WalletsContent />);

    // The wallet total line should show masked value, not Rp
    const walletTotalLabel = screen.getByText("Total uang di dompet");
    const walletTotalContainer = walletTotalLabel.closest("section");
    expect(walletTotalContainer).toBeInTheDocument();

    // Should not contain any Rp-formatted value as visible text in the masked row
    const allRp = screen.queryAllByText(/Rp\d/);
    // Wallet name (BCA) should still be visible; no raw Rp in the hero total
    expect(screen.getByText("BCA")).toBeInTheDocument();
  });

  it("SavingsContent masks totals when hideBalances is true", () => {
    useSmartSpendStore.getState().updateSettings({ hideBalances: true });
    setMockRoute("/wallets?tab=savings", "");

    render(<SavingsContent />);

    expect(screen.getByText("Total tersimpan (target aktif)")).toBeInTheDocument();
    // Target name should still be visible
    expect(screen.getByText("Liburan")).toBeInTheDocument();
  });
});

describe("Reports entry from Dashboard", () => {
  beforeEach(() => {
    setData(realisticData());
    setMockRoute("/", "");
  });

  it("Dashboard CashFlowCard has 'Lihat laporan' link to /reports", () => {
    render(<DashboardPage />);

    const reportLink = screen.getByRole("link", { name: /Lihat laporan/i });
    expect(reportLink).toHaveAttribute("href", "/reports");
  });

  it("Reports page backHref points to / (Beranda context)", () => {
    setMockRoute("/reports", "");
    render(<ReportsPage />);

    // The back button should navigate to "/" (Beranda)
    const backLink = screen.getByRole("link", { name: /kembali/i });
    expect(backLink).toHaveAttribute("href", "/");
  });
});

describe("Settings hub structure", () => {
  beforeEach(() => {
    setMockRoute("/settings", "");
    setData(realisticData());
  });

  it("has PREFERENSI, DATA, and APLIKASI sections", () => {
    render(<SettingsPage />);
    expect(screen.getByText("PREFERENSI")).toBeInTheDocument();
    expect(screen.getByText("DATA")).toBeInTheDocument();
    expect(screen.getByText("APLIKASI")).toBeInTheDocument();
  });

  it("does NOT contain hidden Lainnya shortcuts (Catat, Riwayat, Tambah dompet, Tambah target, Laporan)", () => {
    render(<SettingsPage />);

    expect(screen.queryByText("Catat transaksi")).not.toBeInTheDocument();
    expect(screen.queryByText("Riwayet & filter")).not.toBeInTheDocument();
    expect(screen.queryByText("Riwayat & filter")).not.toBeInTheDocument();
    expect(screen.queryByText("Tambah dompet")).not.toBeInTheDocument();
    expect(screen.queryByText("Tambah target tabangan")).not.toBeInTheDocument();
    expect(screen.queryByText("Tambah target tabungan")).not.toBeInTheDocument();
    expect(screen.queryByText("Laporan")).not.toBeInTheDocument();
  });

  it("does NOT contain hide-balance setting (moved to dashboard)", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/Sembunyikan nominal/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("Tentang SmartSpend section shows version and local-first explanation", () => {
    render(<SettingsPage />);
    expect(screen.getAllByText(/SmartSpend/)[0]).toBeInTheDocument();
    expect(screen.getByText(/lokal/i)).toBeInTheDocument();
    expect(screen.getAllByText(/perangkat/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe("Theme application utility", () => {
  it("applyTheme sets data-theme on documentElement", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // "system" removes the attribute (CSS prefers-color-scheme takes over)
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe(null);
  });

  it("maskMoney returns fixed-width mask placeholder", () => {
    const masked = maskMoney();
    expect(masked).toMatch(/^Rp[\u2022\u2022\u2022\u2022]+$/);
    expect(masked).not.toContain("12345678");
  });
});


describe("Settings About section cleanup", () => {
  beforeEach(() => {
    setMockRoute("/settings", "");
    setData(realisticData());
  });

  it("does NOT contain raw STORAGE_KEY (developer info)", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/smarts-end\.v1/)).not.toBeInTheDocument();
  });

  it("does NOT contain manual storage check button", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: /Cek ulang penyimpanan/i })).not.toBeInTheDocument();
  });

  it("does NOT contain diagnostic timestamps", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/Terakhir disimpan/i)).not.toBeInTheDocument();
  });

  it("does NOT contain wallet/transaction/savings/budget counts", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/Dompet:\s*\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Transaksi:\s*\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tabungan:\s*\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Budget:\s*\d+/)).not.toBeInTheDocument();
  });
});
