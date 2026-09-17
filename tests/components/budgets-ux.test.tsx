import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BudgetsPage from "@/app/budgets/page";
import NewBudgetPage from "@/app/budgets/new/page";
import BudgetDetailPage from "@/app/budgets/[id]/page";
import { BudgetForm } from "@/app/forms/budget-form";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeBudget, makeTarget, makeTx, makeWallet, on } from "../fixtures";
import { NAV_ITEMS } from "@/components/nav/bottom-nav";
import type { PersistedData } from "@/repository/storage-schema";

const push = vi.fn();
const back = vi.fn();
let currentRouteId = "budget-makanan-2026-09";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back }),
  usePathname: () => "/budgets",
  useParams: () => ({ id: currentRouteId }),
}));

function setData(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

function budgetScenarioData(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash" })],
    savingsTargets: [makeTarget("tabungan", 5_000_000, { name: "Tabungan" })],
    budgets: [
      makeBudget("makanan", "2026-09", 1_000_000, { id: "budget-makanan-2026-09" }),
      makeBudget("transportasi", "2026-09", 500_000, { id: "budget-transportasi-2026-09" }),
      makeBudget("hiburan", "2026-09", 200_000, { id: "budget-hiburan-2026-09" }),
    ],
    transactions: [
      // Qualifying expenses in 2026-09
      makeTx({
        id: "tx-mkn-1",
        type: "expense",
        categoryId: "makanan",
        amount: 300_000,
        sourceWalletId: "bca",
        date: on(2026, 9, 2),
        note: "Makan siang",
      }),
      makeTx({
        id: "tx-mkn-2",
        type: "expense",
        categoryId: "makanan",
        amount: 200_000,
        sourceWalletId: "cash",
        date: on(2026, 9, 5),
        note: "Groceries",
      }),
      // Transportasi: 450_000 out of 500_000 (90% - MENDEKATI BATAS)
      makeTx({
        id: "tx-trans-1",
        type: "expense",
        categoryId: "transportasi",
        amount: 450_000,
        sourceWalletId: "bca",
        date: on(2026, 9, 3),
        note: "Bensin & tol",
      }),
      // Hiburan: 250_000 out of 200_000 (125% - MELEBIHI ANGGARAN)
      makeTx({
        id: "tx-hib-1",
        type: "expense",
        categoryId: "hiburan",
        amount: 250_000,
        sourceWalletId: "bca",
        date: on(2026, 9, 4),
        note: "Bioskop & tiket",
      }),
      // Non-qualifying transactions in the same month (MUST NOT affect budget spent)
      makeTx({
        id: "tx-income",
        type: "income",
        categoryId: "gaji",
        amount: 5_000_000,
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
      }),
      makeTx({
        id: "tx-transfer",
        type: "transfer",
        amount: 500_000,
        sourceWalletId: "bca",
        destinationWalletId: "cash",
        date: on(2026, 9, 2),
      }),
      makeTx({
        id: "tx-sav-dep",
        type: "savings_deposit",
        amount: 200_000,
        sourceWalletId: "bca",
        savingsTargetId: "tabungan",
        date: on(2026, 9, 3),
      }),
      makeTx({
        id: "tx-sav-with",
        type: "savings_withdrawal",
        amount: 100_000,
        destinationWalletId: "bca",
        savingsTargetId: "tabungan",
        date: on(2026, 9, 4),
      }),
      makeTx({
        id: "tx-open",
        type: "opening_balance",
        amount: 10_000_000,
        destinationWalletId: "bca",
        date: on(2026, 9, 1),
      }),
      // Expense in a different month (MUST NOT affect 2026-09)
      makeTx({
        id: "tx-mkn-aug",
        type: "expense",
        categoryId: "makanan",
        amount: 800_000,
        sourceWalletId: "bca",
        date: on(2026, 8, 15),
      }),
      // Unbudgeted expense in 2026-09
      makeTx({
        id: "tx-tagihan",
        type: "expense",
        categoryId: "tagihan",
        amount: 150_000,
        sourceWalletId: "bca",
        date: on(2026, 9, 10),
        note: "Listrik",
      }),
    ],
  });
}

describe("Budgets UX — Overview & Derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/budgets?month=2026-09");
    setData(budgetScenarioData());
  });

  it("calculates budget totals strictly from qualifying expense transactions", () => {
    render(<BudgetsPage />);

    // Total limit: 1_000_000 + 500_000 + 200_000 = 1_700_000
    // Total spent: 500_000 (makanan) + 450_000 (transportasi) + 250_000 (hiburan) = 1_200_000
    // Remaining: 1_700_000 - 1_200_000 = 500_000
    // Transfers, savings, income, opening balance must NOT be counted!
    expect(screen.getByText("Rp1.700.000")).toBeInTheDocument();
    expect(screen.getByText("Rp1.200.000")).toBeInTheDocument();
    expect(screen.getByText("Rp500.000")).toBeInTheDocument();
  });

  it("displays explicit status states: AMAN, MENDEKATI BATAS, and MELEBIHI ANGGARAN", () => {
    render(<BudgetsPage />);

    // Makanan: 500_000 / 1_000_000 = 50% -> AMAN
    expect(screen.getByText("AMAN")).toBeInTheDocument();
    expect(screen.getByText("Rp500.000 tersisa")).toBeInTheDocument();

    // Transportasi: 450_000 / 500_000 = 90% -> MENDEKATI BATAS
    expect(screen.getByText("MENDEKATI BATAS")).toBeInTheDocument();
    expect(screen.getByText("Rp50.000 tersisa")).toBeInTheDocument();

    // Hiburan: 250_000 / 200_000 = 125% -> MELEBIHI ANGGARAN
    expect(screen.getByText("MELEBIHI ANGGARAN")).toBeInTheDocument();
    expect(screen.getByText("Rp50.000 melebihi batas")).toBeInTheDocument();
  });

  it("displays unbudgeted expenses section with direct link to create budget", () => {
    render(<BudgetsPage />);

    expect(screen.getByText("Pengeluaran tanpa budget")).toBeInTheDocument();
    expect(screen.getByText("Tagihan")).toBeInTheDocument();
    expect(screen.getByText("Rp150.000")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "+ budget" });
    expect(link).toHaveAttribute("href", "/budgets/new?category=tagihan&month=2026-09");
  });

  it("renders empty state when navigating to a month without any budgets", () => {
    window.history.replaceState({}, "", "/budgets?month=2026-12");
    render(<BudgetsPage />);

    expect(screen.getByText(/Belum ada budget untuk/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat budget/i })).toHaveAttribute(
      "href",
      "/budgets/new?month=2026-12",
    );
  });

  it("handles 0 spending, 100% exact usage, and large IDR amounts correctly", () => {
    const edgeData = emptyData({
      budgets: [
        makeBudget("pendidikan", "2026-09", 500_000_000, { id: "budget-pendidikan" }),
        makeBudget("kesehatan", "2026-09", 1_000_000, { id: "budget-kesehatan" }),
      ],
      transactions: [
        // Exact 100% for kesehatan
        makeTx({
          type: "expense",
          categoryId: "kesehatan",
          amount: 1_000_000,
          date: on(2026, 9, 5),
        }),
        // 0 for pendidikan (large IDR)
      ],
    });
    setData(edgeData);

    render(<BudgetsPage />);

    // Large IDR amount formatted
    expect(screen.getByText("Rp500.000.000")).toBeInTheDocument();
    expect(screen.getByText("Rp500.000.000 tersisa")).toBeInTheDocument();

    // 100% usage shows Rp0 tersisa
    expect(screen.getByText("Rp0 tersisa")).toBeInTheDocument();
  });

  it("safely caps progress bar at 100% visually without clamping financial numbers", () => {
    render(<BudgetsPage />);

    // Hiburan is 125% (250_000 out of 200_000)
    // The progress bar element has aria-valuenow="100" due to ProgressBar capping, but text shows 125%
    const progressBars = screen.getAllByRole("progressbar");
    const hiburanProgress = progressBars.find(
      (pb) => pb.getAttribute("aria-label") === "Budget Hiburan",
    );
    expect(hiburanProgress).toBeDefined();
    expect(hiburanProgress).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("125%")).toBeInTheDocument();
  });
});

describe("Budgets UX — Month Picker & Future Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/budgets?month=2026-09");
    setData(budgetScenarioData());
  });

  it("allows navigating to next month and future months without restriction", async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    // Next month button in MonthPicker
    const nextBtn = screen.getByRole("button", { name: "Bulan berikutnya" });
    await user.click(nextBtn);

    // Now in 2026-10 where no budgets exist yet
    expect(screen.getByText(/Belum ada budget untuk Oktober 2026/i)).toBeInTheDocument();
  });
});

describe("Budgets UX — Create Budget Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/budgets/new?month=2026-09&category=tagihan");
    setData(budgetScenarioData());
  });

  it("pre-fills month and category from query params on /budgets/new", () => {
    render(<NewBudgetPage />);

    const catSelect = screen.getByLabelText("Kategori pengeluaran") as HTMLSelectElement;
    expect(catSelect.value).toBe("tagihan");

    const monthSelect = screen.getByLabelText("Bulan") as HTMLSelectElement;
    expect(monthSelect.value).toBe("2026-09");
  });

  it("disables categories that already have a budget in the selected month", () => {
    render(<NewBudgetPage />);

    const catSelect = screen.getByLabelText("Kategori pengeluaran");
    const makananOption = within(catSelect).getByRole("option", { name: /Makanan \(sudah ada\)/i });
    expect(makananOption).toBeDisabled();

    const tagihanOption = within(catSelect).getByRole("option", { name: "Tagihan" });
    expect(tagihanOption).not.toBeDisabled();
  });

  it("submits a new budget successfully with StickyActions [Simpan anggaran]", async () => {
    const user = userEvent.setup();
    render(<NewBudgetPage />);

    const amountInput = screen.getByLabelText("Batas anggaran");
    await user.type(amountInput, "500000");

    const saveBtn = screen.getByRole("button", { name: "Simpan anggaran" });
    await user.click(saveBtn);

    const storeBudgets = useSmartSpendStore.getState().data.budgets;
    const created = storeBudgets.find((b) => b.categoryId === "tagihan" && b.month === "2026-09");
    expect(created).toBeDefined();
    expect(created?.limitAmount).toBe(500_000);
    expect(push).toHaveBeenCalledWith("/budgets?month=2026-09");
  });

  it("displays duplicate validation error when attempting to create an already existing category budget", async () => {
    const user = userEvent.setup();
    render(<BudgetForm mode="create" defaultMonth="2026-09" defaultCategory="makanan" />);

    const amountInput = screen.getByLabelText("Batas anggaran");
    await user.type(amountInput, "600000");

    const saveBtn = screen.getByRole("button", { name: "Simpan anggaran" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Budget untuk kategori & bulan ini sudah ada. Ubah yang lama.",
      );
    });
  });

  it("cancels creation via [Batal] button and triggers back/onCancel", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<BudgetForm mode="create" defaultMonth="2026-09" onCancel={onCancel} />);

    const cancelBtn = screen.getByRole("button", { name: "Batal" });
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("Budgets UX — Edit Budget Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/budgets?month=2026-09");
    setData(budgetScenarioData());
  });

  it("allows inline edit of limit amount and immediately re-evaluates status", async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    // Hiburan is currently 250_000 / 200_000 -> MELEBIHI ANGGARAN
    expect(screen.getByText("MELEBIHI ANGGARAN")).toBeInTheDocument();

    // Click 'Ubah' on Hiburan card
    const editBtn = screen.getByRole("button", { name: "Ubah budget Hiburan" });
    await user.click(editBtn);

    // Form should appear with [Simpan perubahan]
    const amountInput = screen.getByLabelText("Batas anggaran");
    await user.clear(amountInput);
    await user.type(amountInput, "500000");

    const saveBtn = screen.getByRole("button", { name: "Simpan perubahan" });
    await user.click(saveBtn);

    // Limit updated to 500_000, spend is 250_000 (50%) -> Hiburan is now AMAN
    await waitFor(() => {
      const updatedBudget = useSmartSpendStore
        .getState()
        .data.budgets.find((b) => b.id === "budget-hiburan-2026-09");
      expect(updatedBudget?.limitAmount).toBe(500_000);
    });

    // Qualifying expense transaction remained untouched
    const tx = useSmartSpendStore.getState().data.transactions.find((t) => t.id === "tx-hib-1");
    expect(tx?.amount).toBe(250_000);
  });

  it("renders in-flow actions, hides header '+ Anggaran' action during inline edit, and restores on cancel", async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);

    // '+ Anggaran' buttons are visible initially
    expect(screen.getAllByRole("link", { name: "Anggaran" })).toHaveLength(2);

    // Open inline edit for Makanan
    const editBtn = screen.getByRole("button", { name: "Ubah budget Makanan" });
    await user.click(editBtn);

    // '+ Anggaran' actions are hidden while inline edit is active to avoid competing actions
    expect(screen.queryAllByRole("link", { name: "Anggaran" })).toHaveLength(0);

    // In-flow buttons are present inside the card
    const cancelBtn = screen.getByRole("button", { name: "Batal" });
    const saveBtn = screen.getByRole("button", { name: "Simpan perubahan" });
    expect(cancelBtn).toBeInTheDocument();
    expect(saveBtn).toBeInTheDocument();

    // Cancel inline edit
    await user.click(cancelBtn);

    // Form closes without mutating budget, and header action is restored
    expect(screen.queryByRole("button", { name: "Simpan perubahan" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Anggaran" })).toHaveLength(2);

    const budget = useSmartSpendStore.getState().data.budgets.find((b) => b.id === "budget-makanan-2026-09");
    expect(budget?.limitAmount).toBe(1_000_000);
  });
});

describe("Budgets UX — Delete Budget Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/budgets?month=2026-09");
    setData(budgetScenarioData());
  });

  it("shows confirmation dialog stating expenses remain intact before deleting", () => {
    render(<BudgetsPage />);

    const deleteBtn = screen.getByRole("button", { name: "Hapus budget Makanan" });
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Seluruh transaksi pengeluaran tetap utuh di catatan keuangan/),
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = within(dialog).getByRole("button", { name: "Hapus" });
    fireEvent.click(confirmBtn);

    // Budget removed from store
    const storeBudgets = useSmartSpendStore.getState().data.budgets;
    expect(storeBudgets.some((b) => b.id === "budget-makanan-2026-09")).toBe(false);

    // Expense transactions remain completely intact!
    const mknTx1 = useSmartSpendStore.getState().data.transactions.find((t) => t.id === "tx-mkn-1");
    const mknTx2 = useSmartSpendStore.getState().data.transactions.find((t) => t.id === "tx-mkn-2");
    expect(mknTx1).toBeDefined();
    expect(mknTx2).toBeDefined();
  });
});

describe("Budgets UX — Budget Detail View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRouteId = "budget-makanan-2026-09";
    setData(budgetScenarioData());
  });

  it("displays budget details and strictly related qualifying expense transactions", () => {
    render(<BudgetDetailPage />);

    expect(screen.getByText("Detail budget")).toBeInTheDocument();
    expect(screen.getByText("Makanan")).toBeInTheDocument();
    expect(screen.getByText("Rp1.000.000")).toBeInTheDocument();
    expect(screen.getByText("Rp500.000")).toBeInTheDocument(); // terpakai
    expect(screen.getByText("Rp500.000 tersisa")).toBeInTheDocument();

    // Related transactions list shows only the 2 qualifying expenses for makanan in 2026-09
    expect(screen.getByText("Transaksi pengeluaran (2)")).toBeInTheDocument();
    expect(screen.getByText("Makan siang")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();

    // Transactions from other categories or other months are NOT in the list
    expect(screen.queryByText("Bensin & tol")).not.toBeInTheDocument();
    expect(screen.queryByText("Listrik")).not.toBeInTheDocument();
  });

  it("shows empty state when no expenses exist for this category/month", () => {
    const data = budgetScenarioData();
    // remove makanan expenses
    data.transactions = data.transactions.filter((t) => t.categoryId !== "makanan");
    setData(data);

    render(<BudgetDetailPage />);

    expect(screen.getByText("Belum ada pengeluaran")).toBeInTheDocument();
    expect(screen.getByText(/Belum ada transaksi pengeluaran kategori Makanan/)).toBeInTheDocument();
  });

  it("allows deleting budget from detail page with return to /budgets", () => {
    render(<BudgetDetailPage />);

    const deleteBtn = screen.getByRole("button", { name: /Hapus/i });
    fireEvent.click(deleteBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    const confirmBtn = within(dialog).getByRole("button", { name: "Hapus" });
    fireEvent.click(confirmBtn);

    const storeBudgets = useSmartSpendStore.getState().data.budgets;
    expect(storeBudgets.some((b) => b.id === "budget-makanan-2026-09")).toBe(false);
    expect(push).toHaveBeenCalledWith("/budgets");
  });

  it("shows budget not found empty state when id is invalid", () => {
    currentRouteId = "budget-non-existent";
    render(<BudgetDetailPage />);

    expect(screen.getByText("Budget tidak ditemukan")).toBeInTheDocument();
  });

  it("preserves 5 bottom navigation tabs and highlights Lainnya for budget routes", () => {
    expect(NAV_ITEMS).toHaveLength(5);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Beranda",
      "Transaksi",
      "Dompet",
      "Tabungan",
      "Lainnya",
    ]);

    const moreTab = NAV_ITEMS.find((item) => item.label === "Lainnya");
    expect(moreTab?.match("/budgets")).toBe(true);
    expect(moreTab?.match("/budgets/new")).toBe(true);
    expect(moreTab?.match("/budgets/budget-123")).toBe(true);
  });
});
