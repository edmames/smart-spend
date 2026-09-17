import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { AmountInput } from "@/components/ui/forms";
import { EmptyState, ProgressBar } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BottomNav, NAV_ITEMS } from "@/components/nav/bottom-nav";
import { TransactionRow, describeTransaction } from "@/components/transactions/transaction-row";
import { TransactionForm } from "@/app/forms/transaction-form";
import { Toaster } from "@/components/ui/toaster";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { useToastStore } from "@/app/toast";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { emptyData, makeTarget, makeTx, makeWallet, on } from "../fixtures";

/**
 * Component tests (spec §54–§56 for the parts that are testable without a browser).
 * The point is not "does it look nice" but: does the UI ever let a wrong number
 * through, and does it render the *derived* number rather than a stored one.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/transactions",
  useParams: () => ({ id: "w1" }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));

function AmountHarness({ onSubmit, revision = 0 }: { onSubmit: (amount: number | null) => void; revision?: number }) {
  const form = useForm<{ amount: number | null }>({ defaultValues: { amount: null } });
  return (
    <form
      data-revision={revision}
      onSubmit={form.handleSubmit((values) => {
        onSubmit(values.amount);
      })}
    >
      <AmountInput control={form.control} name="amount" id="amount" />
      <button type="submit">Simpan</button>
    </form>
  );
}

/**
 * Same control, but the canonical value the form actually holds is rendered next to
 * it — that is the number the ledger would receive, so a test can assert on it
 * without going through submit.
 */
function LiveAmountHarness() {
  const form = useForm<{ amount: number | null }>({ defaultValues: { amount: null } });
  const amount = useWatch({ control: form.control, name: "amount" });
  return (
    <div>
      <AmountInput control={form.control} name="amount" id="amount" />
      <output data-testid="canonical">{JSON.stringify(amount)}</output>
    </div>
  );
}

function canonical(): string {
  return screen.getByTestId("canonical").textContent ?? "";
}

describe("AmountInput (money entry)", () => {
  beforeEach(() => {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore.getState().resetStore(emptyData());
  });

  it("uses a numeric keypad and holds an integer, not a float", async () => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("type", "number");

    await userEvent.type(input, "125.000");
    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(125000));
  });

  it.each([
    ["1", 1],
    ["1000", 1000],
    ["100000", 100000],
    ["9999999999", 9_999_999_999],
    ["125.000", 125_000],
    ["Rp1.000.000", 1_000_000],
  ])("turns the typed string %s into the integer %s", async (typed, parsed) => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(parsed));
  });

  it("normalises the displayed value with thousand separators on blur", async () => {
    render(<AmountHarness onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999999999" } });
    // a parseable number is grouped immediately, so what you see is what is stored
    expect(input.value).toBe("9.999.999.999");
    fireEvent.blur(input);
    expect(input.value).toBe("9.999.999.999");
  });

  it("yields null for an empty field instead of 0", async () => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null));
  });
});

/**
 * Regression — "the amount disappears on iPhone".
 *
 * On a phone the field re-groups itself after every keystroke, so by the time the
 * user reaches the 5th digit the text on screen is `1.000` and the next key appends
 * to *that*. The control used to keep that text verbatim once it stopped parsing,
 * and blur then re-read `1.0000` as a decimal and stored `null` — the amount was
 * gone. The invariants below are the ones that were broken.
 */
describe("AmountInput — amount survives typing, blur and re-render", () => {
  beforeEach(() => {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore.getState().resetStore(emptyData());
  });

  it("keeps 100000 as the integer 100000 after typing it digit by digit and blurring", async () => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    await userEvent.type(input, "100000");
    expect(input.value).toBe("100.000");

    fireEvent.blur(input); // dismissing the mobile keyboard
    expect(input.value).toBe("100.000");

    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(100000));
  });

  it("holds the canonical integer while the formatted display is 100.000", () => {
    render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100000" } });
    expect(input.value).toBe("100.000");
    expect(canonical()).toBe("100000");
  });

  it("never stores a formatted string as the canonical value", async () => {
    render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "100000");
    // whatever happens on screen, the form holds a number (or null) and never text
    expect(JSON.parse(canonical())).toBe(100000);
    expect(canonical()).not.toContain(".");
    fireEvent.blur(input);
    expect(JSON.parse(canonical())).toBe(100000);
  });

  it("does not treat a grouping separator as a decimal point", () => {
    render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    // parseFloat("100.000") would be 100; IDR has no sen, so it must be 100000.
    fireEvent.change(input, { target: { value: "100.000" } });
    expect(canonical()).toBe("100000");
    fireEvent.blur(input);
    expect(canonical()).toBe("100000");
  });

  it("does not wipe an amount when blurring text the formatter itself produced", () => {
    render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    // What a fast mobile keyboard leaves behind once the field has re-grouped.
    fireEvent.change(input, { target: { value: "1.0000" } });
    expect(canonical()).toBe("10000");
    fireEvent.blur(input);
    expect(canonical()).toBe("10000");
    expect(input.value).toBe("10.000");
  });

  it("supports the documented maximum, Rp9.999.999.999, end to end", async () => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    await userEvent.type(input, "9999999999");
    expect(input.value).toBe("9.999.999.999");
    fireEvent.blur(input);
    expect(input.value).toBe("9.999.999.999");

    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(9_999_999_999));
  });

  it("keeps the displayed amount and the canonical value across re-renders", () => {
    const { rerender } = render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100000" } });
    fireEvent.blur(input);

    // an unrelated parent re-render (another field changed, a list refreshed, ...)
    rerender(<LiveAmountHarness />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("100.000");
    expect(canonical()).toBe("100000");
  });

  it("still clears deliberately when the user empties the field", async () => {
    const onSubmit = vi.fn();
    render(<AmountHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    await userEvent.type(input, "100000");
    await userEvent.clear(input);
    expect(input.value).toBe("");
    fireEvent.blur(input);
    expect(input.value).toBe("");

    fireEvent.submit(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(null));
  });

  it("accepts a pasted, already formatted amount without changing it", () => {
    render(<LiveAmountHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Rp1.250.000" } });
    expect(canonical()).toBe("1250000");
    fireEvent.blur(input);
    expect(canonical()).toBe("1250000");
    expect(input.value).toBe("1.250.000");
  });
});

describe("ProgressBar (savings/budget bars)", () => {
  it("caps the reported value at 100 but keeps the fill sane", () => {
    render(<ProgressBar percent={150} label="Progres tabungan" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-label", "Progres tabungan");
  });

  it("clamps negative values to 0", () => {
    render(<ProgressBar percent={-25} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("ConfirmDialog", () => {
  it("blocks a deliberate action until the phrase is typed", async () => {
    const onConfirm = vi.fn();
    render(
      <div>
        <ConfirmDialog
          open
          title="Hapus Semua Data"
          requirePhrase="HAPUS"
          confirmLabel="Hapus"
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />
      </div>,
    );
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Hapus" });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByPlaceholderText("HAPUS"), "HAPUS");
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a wrong phrase is not accepted", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Hapus" requirePhrase="HAPUS" onConfirm={onConfirm} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("HAPUS"), "hapus ");
    expect(within(dialog).getByRole("button", { name: "Ya, lanjutkan" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("EmptyState", () => {
  it("is functional, not decorative: title, description and an action", () => {
    render(
      <EmptyState
        title="Belum ada dompet"
        description="Buat dompet pertama untuk mulai mencatat."
        action={createElement("button", { type: "button" }, "Buat dompet")}
      />,
    );
    expect(screen.getByText("Belum ada dompet")).toBeInTheDocument();
    expect(screen.getByText("Buat dompet pertama untuk mulai mencatat.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buat dompet" })).toBeInTheDocument();
  });
});

describe("BottomNav Phase 2F", () => {
  it("renders exactly five labeled primary destinations without a global create shortcut", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Navigasi utama" });
    expect(nav).toBeInTheDocument();
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Beranda", "Transaksi", "Dompet", "Budget", "Lainnya"]);
    for (const label of NAV_ITEMS.map((item) => item.label)) {
      expect(within(nav).getAllByText(label)).toHaveLength(1);
    }
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/transactions",
      "/wallets",
      "/budgets",
      "/more",
    ]);
    expect(within(nav).queryByRole("link", { name: "Tambah transaksi" })).not.toBeInTheDocument();
    // Tabungan must not be standalone bottom nav
    expect(within(nav).queryByText("Tabungan")).not.toBeInTheDocument();
  });
});

describe("TransactionRow", () => {
  beforeEach(() => {
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore
      .getState()
      .resetStore(
        emptyData({
          wallets: [makeWallet("w1", { name: "BCA" }), makeWallet("w2", { name: "Cash", type: "cash" })],
          savingsTargets: [makeTarget("s1", 1_000_000, { name: "Dana Darurat" })],
        }),
      );
  });

  it("signs the amount by type and labels QRIS as a payment method", () => {
    const transaction = makeTx({
      id: "t1",
      type: "expense",
      amount: 100_000,
      sourceWalletId: "w1",
      categoryId: "makanan",
      paymentMethod: "qris",
      note: "Makan siang",
      date: on(2026, 8, 15),
    });
    render(<TransactionRow transaction={transaction} />);
    expect(screen.getByText("-Rp100.000")).toBeInTheDocument();
    expect(screen.getByText("Makan siang")).toBeInTheDocument();
    expect(screen.getByText(/BCA/)).toBeInTheDocument();
    expect(screen.getByText("QRIS")).toBeInTheDocument();
    // QRIS is a method, never a wallet/account in the description
    expect(screen.queryByText(/Masuk ke QRIS|dari QRIS/i)).not.toBeInTheDocument();
  });

  it("shows internal movements as neutral, with an explicit badge", () => {
    const transfer = makeTx({
      id: "t2",
      type: "transfer",
      amount: 200_000,
      sourceWalletId: "w1",
      destinationWalletId: "w2",
      date: on(2026, 8, 16),
    });
    render(<TransactionRow transaction={transfer} />);
    expect(screen.getByText("Rp200.000")).toBeInTheDocument(); // no sign: not income or expense
    expect(screen.getByText("BCA → Cash")).toBeInTheDocument();
    expect(screen.getAllByText("Transfer").length).toBeGreaterThan(0);
    // an internal movement is never shown with a +/- sign
    expect(screen.queryByText("+Rp200.000")).not.toBeInTheDocument();
    expect(screen.queryByText("-Rp200.000")).not.toBeInTheDocument();
  });

  it("describes a savings deposit as wallet → target (not as an expense)", () => {
    const deposit = makeTx({
      id: "t3",
      type: "savings_deposit",
      amount: 300_000,
      sourceWalletId: "w1",
      savingsTargetId: "s1",
      date: on(2026, 8, 17),
    });
    render(<TransactionRow transaction={deposit} />);
    expect(screen.getByText("BCA → Dana Darurat")).toBeInTheDocument();
    expect(screen.getByText("Rp300.000")).toBeInTheDocument();
  });

  it("labels a wallet whose record survived deletion", () => {
    const orphan = makeTx({ id: "t4", type: "expense", amount: 1_000, sourceWalletId: "gone", categoryId: "makanan" });
    expect(
      describeTransaction(orphan, {
        walletName: (id) => (id === "gone" ? "Dompet terhapus" : id ?? "—"),
        savingsName: () => "—",
      }),
    ).toMatch(/Dompet terhapus/);
  });
});

describe("TransactionForm (real create flow, no placeholders)", () => {
  let push: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useToastStore.getState().toasts.forEach((toast) => useToastStore.getState().dismiss(toast.id));
    push = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
    useSmartSpendStore
      .getState()
      .resetStore(
        emptyData({
          wallets: [makeWallet("w1", { name: "BCA" })],
          transactions: [
            makeTx({ id: "o1", type: "opening_balance", amount: 500_000, destinationWalletId: "w1", date: on(2026, 1, 1) }),
          ],
        }),
      );
  });

  it("rejects an empty amount and a missing category before hitting the domain", async () => {
    render(<TransactionForm mode="create" initialKind="expense" />);
    fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(useSmartSpendStore.getState().data.transactions).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("submits a parsed integer amount to the store and records it in the ledger", async () => {
    render(<TransactionForm mode="create" initialKind="expense" />);
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "125.000" } });
    await userEvent.selectOptions(screen.getByLabelText(/^Kategori/i), "makanan");
    await userEvent.selectOptions(screen.getByLabelText(/Dari dompet/i), "w1");

    fireEvent.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() => {
      expect(useSmartSpendStore.getState().data.transactions).toHaveLength(2);
    });
    const added = useSmartSpendStore.getState().data.transactions.at(-1)!;
    expect(added).toMatchObject({ type: "expense", amount: 125_000, categoryId: "makanan", sourceWalletId: "w1" });
  });

  it("surfaces the domain rejection (not enough balance) and writes nothing", async () => {
    render(
      <>
        <TransactionForm mode="create" initialKind="expense" />
        <Toaster />
      </>,
    );
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "9.999.999.999" } });
    await userEvent.selectOptions(screen.getByLabelText(/^Kategori/i), "makanan");
    await userEvent.selectOptions(screen.getByLabelText(/Dari dompet/i), "w1");
    fireEvent.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    // the domain's reason reaches the screen verbatim, twice over: as an inline
    // field error and as a toast
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/tidak cukup/i);
    expect(screen.getAllByText(/tersedia Rp500\.000, dibutuhkan Rp9\.999\.999\.999/).length).toBeGreaterThanOrEqual(2);
    expect(useSmartSpendStore.getState().data.transactions).toHaveLength(1);
    // and the rejected amount was not silently truncated or coerced
    expect(useSmartSpendStore.getState().data.transactions[0]).toMatchObject({ type: "opening_balance" });
  });

  it("clears references that the other kinds cannot use", async () => {
    render(<TransactionForm mode="create" initialKind="transfer" />);
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.queryByLabelText(/Dari dompet/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Ke dompet/i)).toBeInTheDocument();
    // ...and the amount field survived the switch
    expect(screen.getByLabelText(/Nominal/i)).toBeInTheDocument();
  });
});
