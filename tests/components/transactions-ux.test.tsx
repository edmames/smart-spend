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

/** One expense of an exact size, so the detail hero can be exercised at any magnitude. */
function seedSingleExpense(amount: number) {
  useSmartSpendStore.getState().resetStore(
    emptyData({
      wallets: [makeWallet("bca", { name: "BCA" })],
      transactions: [
        makeTx({
          id: "big",
          type: "expense",
          amount,
          sourceWalletId: "bca",
          categoryId: "makanan",
          note: "Belanja besar",
          date: on(2026, 9, 7),
          createdAt: at(2026, 9, 7, 8),
        }),
      ],
    }),
  );
  useSmartSpendStore.setState({ hydration: "ready" });
  routeId = "big";
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

  it("shows Kelola kategori link in primary actions", () => {
    seedData();
    render(<TransactionsPage />);

    expect(screen.getByRole("link", { name: "Catat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kelola kategori" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kelola kategori" })).toHaveAttribute("href", "/categories");
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

  /**
   * The largest values a user can record, by the four magnitudes the visual review
   * called out. Rendering them is the part jsdom can check; whether they *fit* is a
   * layout question, so what is asserted here is the structure that makes fitting
   * possible: the amount never shares a row with the actions.
   */
  it.each([1_000, 1_000_000, 999_999_999, 9_999_999_999])(
    "gives the amount %s a row of its own, clear of the Ubah and Hapus controls",
    (amount) => {
      seedSingleExpense(amount);
      render(<TransactionDetailPage />);

      const amountBlock = screen.getByText(`-Rp${amount.toLocaleString("id-ID")}`).parentElement as HTMLElement;
      expect(within(amountBlock).queryByRole("button")).toBeNull();
      expect(amountBlock.contains(screen.getByRole("button", { name: "Ubah" }))).toBe(false);
      expect(amountBlock.contains(screen.getByRole("button", { name: "Hapus transaksi" }))).toBe(false);
    },
  );

  it("leaves edit mode through an explicit Tutup control, not a pencil toggle", () => {
    seedData();
    routeId = "expense";
    render(<TransactionDetailPage />);

    // Normal mode keeps both row actions easy to discover.
    expect(screen.getByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus transaksi" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));

    const close = screen.getByRole("button", { name: "Tutup" });
    expect(close).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Ubah" })).not.toBeInTheDocument();
    // Tutup is not the only way out: the tray keeps a secondary Batal beside save.
    expect(screen.getByRole("button", { name: "Batal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeInTheDocument();

    fireEvent.click(close);
    expect(screen.getByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan perubahan" })).not.toBeInTheDocument();
  });

  /**
   * Both edit-mode exits must be inert with respect to the ledger: the form holds a
   * draft copy, so leaving it can only discard. The stored record is compared as text
   * so that mutating the same object in place cannot pass unnoticed.
   */
  it("cancels an edit from Batal and from Tutup without writing anything", () => {
    seedData();
    routeId = "expense";
    render(<TransactionDetailPage />);

    const stored = () =>
      JSON.stringify(useSmartSpendStore.getState().data.transactions.find((item) => item.id === "expense"));
    const original = stored();

    // the sticky tray's Batal
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "123.456" } });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("button", { name: "Simpan perubahan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(stored()).toBe(original);

    // the detail header's Tutup
    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "654.321" } });
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(screen.queryByRole("button", { name: "Simpan perubahan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah" })).toBeInTheDocument();

    expect(stored()).toBe(original);
    expect(useSmartSpendStore.getState().data.transactions.find((item) => item.id === "expense")?.amount).toBe(750_000);
  });

  it("still saves an edit through Simpan perubahan", async () => {
    seedData();
    routeId = "expense";
    render(<TransactionDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "100.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));

    await waitFor(() =>
      expect(useSmartSpendStore.getState().data.transactions.find((item) => item.id === "expense")?.amount).toBe(100_000),
    );
  });

  it("keeps all five kinds pickable in one block that still explains the chosen one", async () => {
    seedData();
    render(<TransactionForm mode="create" initialKind="expense" />);

    const picker = screen.getByRole("group", { name: "Jenis transaksi" });
    expect(within(picker).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Masuk",
      "Keluar",
      "Transfer",
      "Setor",
      "Tarik",
    ]);
    expect(within(picker).getByRole("button", { name: "Keluar" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Masuk", "Transfer", "Setor", "Tarik"]) {
      expect(within(picker).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }

    // the explanation travels with the picker instead of sitting in a second card
    const block = picker.closest("section") as HTMLElement;
    expect(block).not.toBeNull();
    expect(within(block).getByText(/mengurangi uang total/i)).toBeInTheDocument();

    // ...and Nominal is still further down the same form, not displaced past it
    const amountField = screen.getByLabelText(/Nominal/i);
    expect(picker.compareDocumentPosition(amountField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(within(picker).getByRole("button", { name: "Transfer" }));
    expect(within(picker).getByRole("button", { name: "Transfer" })).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getByRole("button", { name: "Keluar" })).toHaveAttribute("aria-pressed", "false");
    expect(within(block).getByText(/memindahkan uang antar dompet/i)).toBeInTheDocument();
  });

  it("shows Kelola kategori link in transaction form for expense/create", async () => {
    seedData();
    render(<TransactionForm mode="create" initialKind="expense" />);

    expect(screen.getByLabelText(/^Kategori/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kelola kategori" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kelola kategori" })).toHaveAttribute("href", "/categories");

    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.getByRole("link", { name: "Kelola kategori" })).toHaveAttribute("href", "/categories");
  });
});



