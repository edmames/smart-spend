import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoriesPage from "@/app/categories/page";
import MorePage from "@/app/more/page";
import NewBudgetPage from "@/app/budgets/new/page";
import TransactionDetailPage from "@/app/transactions/[id]/page";
import { BudgetForm } from "@/app/forms/budget-form";
import { TransactionForm } from "@/app/forms/transaction-form";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { ExpenseByCategoryCard } from "@/components/reports/report-cards";
import { NAV_ITEMS } from "@/components/nav/bottom-nav";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { migratePayload, parsePersistedData, seedDefaultCategories, serializePersistedData, STORAGE_VERSION } from "@/repository/storage-schema";
import { calculateCategoryBreakdown, calculateBudgetUsageList } from "@/domain/selectors";
import { getCategoryMeta, categoryLabel } from "@/domain/categories";
import { emptyData, makeBudget, makeTx, makeWallet, on } from "../fixtures";

const push = vi.fn();
let pathname = "/categories";
let routeId = "custom-food";
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => pathname,
  useParams: () => ({ id: routeId }),
  useSearchParams: () => ({
    get: (key: string) => searchParams.get(key),
    toString: () => searchParams.toString(),
    has: (key: string) => searchParams.has(key),
  }),
}));

function setData(data = emptyData()) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
  push.mockClear();
  pathname = "/categories";
  routeId = "custom-food";
  searchParams = new URLSearchParams();
}

describe("Phase 2H category persistence and model", () => {
  beforeEach(() => setData());

  it("preserves default category ids and does not duplicate them during migration", () => {
    const migrated = migratePayload({ version: 2, wallets: [], transactions: [], savingsTargets: [], budgets: [], settings: { currency: "IDR" } });
    expect(migrated?.payload.version).toBe(STORAGE_VERSION);
    const parsed = parsePersistedData(migrated?.payload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.categories.map((category) => category.id)).toEqual(seedDefaultCategories().map((category) => category.id));
    expect(new Set(parsed.data.categories.map((category) => category.id)).size).toBe(parsed.data.categories.length);
  });

  it("creates, persists, exports, imports, edits, archives and restores a stable custom category", () => {
    const store = useSmartSpendStore.getState();
    const created = store.createCategory({ id: "kopi", label: "  Kopi  ", type: "expense", icon: "utensils" });
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).toMatchObject({ id: "kopi", label: "Kopi", type: "expense", icon: "utensils" });

    const duplicate = store.createCategory({ label: "kopi", type: "expense", icon: "receipt" });
    expect(duplicate.ok).toBe(false);

    const renamed = store.updateCategory("kopi", { label: "Kopi harian", icon: "receipt" });
    if (!renamed.ok) throw new Error(renamed.error.message);
    expect(renamed.value).toMatchObject({ id: "kopi", label: "Kopi harian", icon: "receipt", type: "expense" });

    expect(store.archiveCategory("kopi").ok).toBe(true);
    expect(useSmartSpendStore.getState().data.categories.find((category) => category.id === "kopi")?.archivedAt).toBeTruthy();
    expect(store.restoreCategory("kopi").ok).toBe(true);
    expect(useSmartSpendStore.getState().data.categories.find((category) => category.id === "kopi")?.archivedAt).toBeNull();

    const raw = serializePersistedData(useSmartSpendStore.getState().data);
    const imported = parsePersistedData(JSON.parse(raw));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.data.categories.find((category) => category.id === "kopi")?.label).toBe("Kopi harian");
  });

  it("keeps a custom category through repository hydration and every lifecycle action preserves its id", async () => {
    const adapter = new MemoryStorageAdapter();
    configureRepository(createLocalStorageRepository(adapter));
    useSmartSpendStore.getState().resetStore(emptyData());
    useSmartSpendStore.setState({ hydration: "ready" });

    const created = useSmartSpendStore.getState().createCategory({ id: "kopi", label: "Kopi", type: "expense", icon: "utensils" });
    if (!created.ok) throw new Error(created.error.message);
    if (!created.value) throw new Error("category creation returned no value");
    expect(created.value.id).toBe("kopi");
    const renamed = useSmartSpendStore.getState().updateCategory("kopi", { label: "Kopi Sore", icon: "receipt" });
    if (!renamed.ok) throw new Error(renamed.error.message);
    expect(renamed.value).toMatchObject({ id: "kopi", label: "Kopi Sore", icon: "receipt", type: "expense" });
    const archived = useSmartSpendStore.getState().archiveCategory("kopi");
    if (!archived.ok) throw new Error(archived.error.message);
    if (!archived.value) throw new Error("category archive returned no value");
    expect(archived.value.id).toBe("kopi");
    const restored = useSmartSpendStore.getState().restoreCategory("kopi");
    if (!restored.ok) throw new Error(restored.error.message);
    expect(restored.value).toMatchObject({ id: "kopi", archivedAt: null });

    useSmartSpendStore.getState().resetStore();
    await useSmartSpendStore.getState().hydrate();
    expect(useSmartSpendStore.getState().data.categories.find((category) => category.id === "kopi")).toMatchObject({
      id: "kopi",
      label: "Kopi Sore",
      icon: "receipt",
      type: "expense",
      archivedAt: null,
    });
  });

  it("rejects empty names, invalid icons and duplicate active same-type names while allowing same name across types", () => {
    const store = useSmartSpendStore.getState();
    expect(store.createCategory({ label: " ", type: "expense", icon: "utensils" }).ok).toBe(false);
    expect(store.createCategory({ label: "Valid", type: "expense", icon: "bad-icon" }).ok).toBe(false);
    expect(store.createCategory({ label: "Bonus kecil", type: "income", icon: "gift" }).ok).toBe(true);
    expect(store.createCategory({ label: "Bonus kecil", type: "expense", icon: "gift" }).ok).toBe(true);
    expect(store.createCategory({ label: "bonus kecil", type: "expense", icon: "gift" }).ok).toBe(false);
    const expenseBonus = useSmartSpendStore.getState().data.categories.find((category) => category.label === "Bonus kecil" && category.type === "expense");
    expect(expenseBonus).toBeDefined();
    expect(store.archiveCategory(expenseBonus?.id ?? "").ok).toBe(true);
    expect(store.createCategory({ label: "BONUS KECIL", type: "expense", icon: "gift" }).ok).toBe(true);
  });
});

describe("Phase 2H categories UX and navigation", () => {
  beforeEach(() => setData());

  it("keeps bottom navigation unchanged at 5 items and /categories activates Transaksi tab", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Beranda", "Transaksi", "Dompet", "Budget", "Lainnya"]);
    expect(NAV_ITEMS.some((item) => item.href === "/categories")).toBe(false);
    // /categories should match Transaksi tab (now includes /categories)
    expect(NAV_ITEMS.find((item) => item.label === "Lainnya")?.match("/categories")).toBe(false);
    expect(NAV_ITEMS.find((item) => item.label === "Transaksi")?.match("/categories")).toBe(true);
  });

  it("does NOT expose Kategori from Lainnya page", () => {
    render(<MorePage />);
    // Verify no link to /categories exists (categories is now in Transaksi tab)
    const categoriesLink = screen.getAllByRole("link").find((link) => link.getAttribute("href") === "/categories");
    expect(categoriesLink).toBeUndefined();
  });

  it("does NOT expose internal category IDs in the category list", () => {
    render(<CategoriesPage />);
    // Should show category label and type, but NOT "ID makanan" or similar
    expect(screen.getByText("Makanan")).toBeInTheDocument();
    // "Pengeluaran" appears multiple times (type selector, category items)
    expect(screen.getAllByText("Pengeluaran").length).toBeGreaterThan(0);
    // Ensure no ID text exists in the rendered output
    expect(screen.queryByText(/ID \w+/)).toBeNull();
  });

  it("renders categories, creates custom categories, edits icon/name, and archives/restores", async () => {
    render(<CategoriesPage />);
    expect(screen.getByText("Makanan")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Tambah/i }));
    fireEvent.change(screen.getByLabelText(/Nama kategori/i), { target: { value: "Kopi" } });
    await userEvent.click(screen.getByRole("button", { name: "Pilih icon Tagihan" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan kategori" }));

    expect(await screen.findByText("Kopi")).toBeInTheDocument();
    expect(useSmartSpendStore.getState().data.categories.find((category) => category.label === "Kopi")).toMatchObject({ type: "expense", icon: "receipt" });

    await userEvent.click(screen.getByRole("button", { name: "Ubah kategori Kopi" }));
    fireEvent.change(screen.getByLabelText(/Nama kategori/i), { target: { value: "Kopi kantor" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    expect(await screen.findByText("Kopi kantor")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Arsipkan kategori Kopi kantor" }));
    await userEvent.click(screen.getByRole("button", { name: /Tampilkan arsip/i }));
    expect(await screen.findByText("arsip")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Pulihkan kategori Kopi kantor/i }));
    expect(useSmartSpendStore.getState().data.categories.find((category) => category.label === "Kopi kantor")?.archivedAt).toBeNull();
  });
});

describe("Phase 2H category integrations", () => {
  beforeEach(() => {
    setData(emptyData({ wallets: [makeWallet("bca", { name: "BCA" })] }));
    const store = useSmartSpendStore.getState();
    store.createCategory({ id: "kopi", label: "Kopi", type: "expense", icon: "utensils" });
    store.createCategory({ id: "freelance", label: "Freelance", type: "income", icon: "business" });
    store.createCategory({ id: "arsip", label: "Arsip lama", type: "expense", icon: "receipt" });
    store.archiveCategory("arsip");
  });

  it("transaction form uses active categories by type and excludes archived categories for new records", async () => {
    render(<TransactionForm mode="create" initialKind="expense" />);
    expect(screen.getByLabelText(/^Kategori/i)).toHaveTextContent("Kopi");
    expect(screen.getByLabelText(/^Kategori/i)).not.toHaveTextContent("Freelance");
    expect(screen.getByLabelText(/^Kategori/i)).not.toHaveTextContent("Arsip lama");

    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.getByLabelText(/^Kategori/i)).toHaveTextContent("Freelance");
    expect(screen.getByLabelText(/^Kategori/i)).not.toHaveTextContent("Kopi");
  });

  it("historical transaction edit and reports still resolve archived categories", () => {
    useSmartSpendStore.getState().resetStore(emptyData({
      wallets: [makeWallet("bca", { name: "BCA" })],
      categories: useSmartSpendStore.getState().data.categories,
      transactions: [makeTx({ id: "old", type: "expense", amount: 50_000, sourceWalletId: "bca", categoryId: "arsip", date: on(2026, 9, 2) })],
      budgets: [makeBudget("arsip", "2026-09", 100_000, { id: "budget-arsip" })],
    }));
    useSmartSpendStore.setState({ hydration: "ready" });

    const transaction = useSmartSpendStore.getState().data.transactions[0];
    render(<TransactionForm mode="edit" transaction={transaction} />);
    expect(screen.getByLabelText(/^Kategori/i)).toHaveTextContent("Arsip lama (arsip)");

    const categories = useSmartSpendStore.getState().data.categories;
    expect(getCategoryMeta("arsip", categories)?.label).toBe("Arsip lama");
    expect(categoryLabel("arsip", "Tanpa kategori", categories)).toBe("Arsip lama");

    const entries = calculateCategoryBreakdown(useSmartSpendStore.getState().data.transactions, { type: "expense", monthKey: "2026-09" });
    render(<ExpenseByCategoryCard entries={entries} monthKey="2026-09" monthLabel="September 2026" categories={categories} />);
    expect(screen.getByText("Arsip lama")).toBeInTheDocument();
  });

  it("archived category metadata stays visible in historical transactions, budgets and reports without changing totals", () => {
    const categories = useSmartSpendStore.getState().data.categories;
    const beforeTransactions = [
      makeTx({ id: "old-kopi", type: "expense", amount: 50_000, sourceWalletId: "bca", categoryId: "arsip", date: on(2026, 9, 2), note: "" }),
    ];
    useSmartSpendStore.getState().resetStore(emptyData({
      wallets: [makeWallet("bca", { name: "BCA" })],
      categories,
      transactions: beforeTransactions,
      budgets: [makeBudget("arsip", "2026-09", 100_000, { id: "budget-arsip" })],
    }));
    useSmartSpendStore.setState({ hydration: "ready" });

    const beforeJson = JSON.stringify(useSmartSpendStore.getState().data);
    const beforeBreakdown = calculateCategoryBreakdown(useSmartSpendStore.getState().data.transactions, { type: "expense", monthKey: "2026-09" });
    const beforeBudgetUsage = calculateBudgetUsageList(useSmartSpendStore.getState().data.budgets, useSmartSpendStore.getState().data.transactions, "2026-09");

    const rowRender = render(<TransactionRow transaction={useSmartSpendStore.getState().data.transactions[0]!} />);
    expect(screen.getByText("Arsip lama")).toBeInTheDocument();
    expect(screen.getByText(/Arsip lama · BCA/)).toBeInTheDocument();
    rowRender.unmount();

    routeId = "old-kopi";
    const detailRender = render(<TransactionDetailPage />);
    expect(screen.getAllByText("Arsip lama · BCA").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Kategori").closest("div")).toHaveTextContent("Arsip lama");
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    expect(screen.getByLabelText(/^Kategori/i)).toHaveTextContent("Arsip lama (arsip)");
    detailRender.unmount();

    const newTransaction = render(<TransactionForm mode="create" initialKind="expense" />);
    expect(screen.getByLabelText(/^Kategori/i)).not.toHaveTextContent("Arsip lama");
    newTransaction.unmount();

    const budgetCreate = render(<BudgetForm mode="create" defaultMonth="2026-09" />);
    expect(screen.getByLabelText(/Kategori pengeluaran/i)).not.toHaveTextContent("Arsip lama");
    budgetCreate.unmount();

    const budget = useSmartSpendStore.getState().data.budgets[0]!;
    const budgetEdit = render(<BudgetForm mode="edit" budget={budget} defaultMonth="2026-09" />);
    expect(screen.getByLabelText(/Kategori pengeluaran/i)).toHaveTextContent("Arsip lama (arsip)");
    budgetEdit.unmount();

    const entries = calculateCategoryBreakdown(useSmartSpendStore.getState().data.transactions, { type: "expense", monthKey: "2026-09" });
    render(<ExpenseByCategoryCard entries={entries} monthKey="2026-09" monthLabel="September 2026" categories={useSmartSpendStore.getState().data.categories} />);
    expect(screen.getByText("Arsip lama")).toBeInTheDocument();
    expect(entries).toEqual(beforeBreakdown);
    expect(calculateBudgetUsageList(useSmartSpendStore.getState().data.budgets, useSmartSpendStore.getState().data.transactions, "2026-09")).toEqual(beforeBudgetUsage);
    expect(JSON.stringify(useSmartSpendStore.getState().data.transactions)).toBe(JSON.stringify(JSON.parse(beforeJson).transactions));
    expect(JSON.stringify(useSmartSpendStore.getState().data.budgets)).toBe(JSON.stringify(JSON.parse(beforeJson).budgets));
  });

  it("budget creation uses active expense categories only while historical budgets remain readable", () => {
    render(<BudgetForm mode="create" defaultMonth="2026-09" />);
    const select = screen.getByLabelText(/Kategori pengeluaran/i);
    expect(select).toHaveTextContent("Kopi");
    expect(select).not.toHaveTextContent("Freelance");
    expect(select).not.toHaveTextContent("Arsip lama");

    const data = emptyData({
      wallets: [makeWallet("bca", { name: "BCA" })],
      categories: useSmartSpendStore.getState().data.categories,
      budgets: [makeBudget("arsip", "2026-09", 100_000, { id: "budget-arsip" })],
      transactions: [makeTx({ id: "old", type: "expense", amount: 50_000, sourceWalletId: "bca", categoryId: "arsip", date: on(2026, 9, 2) })],
    });
    const usage = calculateBudgetUsageList(data.budgets, data.transactions, "2026-09");
    expect(usage[0]?.budget.categoryId).toBe("arsip");
    expect(categoryLabel(usage[0]?.budget.categoryId, "Tanpa kategori", data.categories)).toBe("Arsip lama");
  });

  it("/categories renders with hydration and /budgets/new stays reachable", () => {
    render(<CategoriesPage />);
    expect(screen.getByText("Pengeluaran aktif")).toBeInTheDocument();

    searchParams = new URLSearchParams("month=2026-09");
    render(<NewBudgetPage />);
    expect(screen.getByRole("button", { name: "Simpan anggaran" })).toBeInTheDocument();
  });
});

