import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "@/app/transactions/page";
import NewTransactionPage from "@/app/transactions/new/page";
import TransactionDetailPage from "@/app/transactions/[id]/page";
import { TransactionForm } from "@/app/forms/transaction-form";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";

const push = vi.fn();
const replace = vi.fn();
let routeId = "expense";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/transactions",
  useParams: () => ({ id: routeId }),
}));

function seedData() {
  useSmartSpendStore.getState().resetStore(
    emptyData({
      wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash", type: "cash" })],
      savingsTargets: [makeTarget("liburan", 2_000_000, { name: "Liburan" })],
      transactions: [
        makeTx({
          id: "opening",
          type: "opening_balance",
          amount: 1_000_000,
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
          note: "Gaji bulanan",
          date: on(2026, 9, 2),
          createdAt: at(2026, 9, 2, 8),
        }),
        makeTx({
          id: "expense",
          type: "expense",
          amount: 750_000,
          sourceWalletId: "bca",
          categoryId: "makanan",
          paymentMethod: "qris",
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
          amount: 250_000,
          destinationWalletId: "cash",
          savingsTargetId: "liburan",
          date: on(2026, 9, 6),
          createdAt: at(2026, 9, 6, 8),
        }),
      ],
    }),
  );
  useSmartSpendStore.setState({ hydration: "ready" });
}

describe("Transactions Phase 2C UX", () => {
  beforeEach(() => {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore.getState().resetStore(emptyData());
    useSmartSpendStore.setState({ hydration: "ready" });
    push.mockClear();
    replace.mockClear();
    routeId = "expense";
    window.history.replaceState(null, "", "/transactions");
  });

  it("renders every transaction meaning without making internal movements look like income or expense", () => {
    seedData();
    const data = useSmartSpendStore.getState().data;

    for (const transaction of data.transactions) {
      const { unmount } = render(<TransactionRow transaction={transaction} />);
      if (transaction.type === "income" || transaction.type === "opening_balance") {
        expect(screen.getByText(new RegExp(`\\+Rp${transaction.amount.toLocaleString("id-ID")}`))).toBeInTheDocument();
      } else if (transaction.type === "expense") {
        expect(screen.getByText("-Rp750.000")).toBeInTheDocument();
      } else {
        expect(screen.getByText(`Rp${transaction.amount.toLocaleString("id-ID")}`)).toBeInTheDocument();
        expect(screen.queryByText(`+Rp${transaction.amount.toLocaleString("id-ID")}`)).not.toBeInTheDocument();
        expect(screen.queryByText(`-Rp${transaction.amount.toLocaleString("id-ID")}`)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it("supports search, no-results, and reset on the transaction list", async () => {
    seedData();
    render(<TransactionsPage />);

    expect(screen.getByText("Belanja pasar")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Cari transaksi" }), { target: { value: "nomatch" } });
    expect(await screen.findByText("Pencarian tidak menemukan transaksi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset pencarian/i }));
    expect(await screen.findByText("Belanja pasar")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Cari transaksi" })).toHaveValue("");
  });

  it("filters by transaction type and resets active filters", async () => {
    seedData();
    render(<TransactionsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Filter/i }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(await screen.findByText("BCA → Cash")).toBeInTheDocument();
    expect(screen.queryByText("Belanja pasar")).not.toBeInTheDocument();

    const filterPanel = screen.getByText("Saring transaksi").closest("section");
    expect(filterPanel).not.toBeNull();
    fireEvent.click(within(filterPanel as HTMLElement).getByRole("button", { name: /Reset filter/i }));
    expect(await screen.findByText("Belanja pasar")).toBeInTheDocument();
  });

  it("keeps new transaction wallet-first when no wallet exists", () => {
    render(<NewTransactionPage />);

    expect(screen.getByText("Buat dompet dulu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat dompet/i })).toHaveAttribute("href", "/wallets/new");
    expect(screen.queryByRole("button", { name: "Simpan transaksi" })).not.toBeInTheDocument();
  });

  it("adapts the form fields by type without showing irrelevant payment metadata", async () => {
    seedData();
    render(<TransactionForm mode="create" initialKind="expense" />);

    expect(screen.getByLabelText(/^Kategori/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dari dompet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Metode pembayaran/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(screen.getByLabelText(/Dari dompet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ke dompet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Kategori/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Metode pembayaran/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Setor" }));
    expect(screen.getByLabelText(/Dari dompet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target tabungan/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ke dompet/i)).not.toBeInTheDocument();
  });

  it("creates income and transfer records through the existing store path", async () => {
    seedData();
    const firstForm = render(<TransactionForm mode="create" initialKind="income" />);

    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "1.250.000" } });
    await userEvent.selectOptions(screen.getByLabelText(/^Kategori/i), "gaji");
    await userEvent.selectOptions(screen.getByLabelText(/Ke dompet/i), "bca");
    fireEvent.click(screen.getByRole("button", { name: "Simpan transaksi" }));
    await waitFor(() => expect(useSmartSpendStore.getState().data.transactions.at(-1)).toMatchObject({ type: "income", amount: 1_250_000 }));

    firstForm.unmount();

    render(<TransactionForm mode="create" initialKind="transfer" />);
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "100.000" } });
    await userEvent.selectOptions(screen.getByLabelText(/Dari dompet/i), "bca");
    await userEvent.selectOptions(screen.getByLabelText(/Ke dompet/i), "cash");
    fireEvent.click(screen.getByRole("button", { name: "Simpan transaksi" }));
    await waitFor(() => expect(useSmartSpendStore.getState().data.transactions.at(-1)).toMatchObject({ type: "transfer", amount: 100_000 }));
  });

  it("shows detail, edit, delete confirmation, and removes only after explicit confirmation", async () => {
    seedData();
    routeId = "expense";
    render(<TransactionDetailPage />);

    expect(screen.getByText("Belanja pasar")).toBeInTheDocument();
    expect(screen.getByText("-Rp750.000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    expect(await screen.findByRole("button", { name: "Simpan perubahan" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hapus transaksi" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Pengeluaran/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hapus" })).toBeDisabled();

    await userEvent.type(within(dialog).getByPlaceholderText("HAPUS"), "HAPUS");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(useSmartSpendStore.getState().data.transactions.some((t) => t.id === "expense")).toBe(false));
    expect(push).toHaveBeenCalledWith("/transactions");
  });

  it("surfaces validation failures from edit without mutating the transaction", async () => {
    seedData();
    const transaction = useSmartSpendStore.getState().data.transactions.find((item) => item.id === "expense");
    expect(transaction).toBeDefined();
    render(<TransactionForm mode="edit" transaction={transaction} />);

    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "9.999.999.999" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/tidak cukup/i));
    expect(useSmartSpendStore.getState().data.transactions.find((item) => item.id === "expense")?.amount).toBe(750_000);
  });
});



