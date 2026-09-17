import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletsPage from "@/app/wallets/page";
import NewWalletPage from "@/app/wallets/new/page";
import EditWalletPage from "@/app/wallets/[id]/edit/page";
import WalletDetailPage from "@/app/wallets/[id]/page";
import SavingsPage from "@/app/savings/page";
import NewSavingsTargetPage from "@/app/savings/new/page";
import SavingsDetailPage from "@/app/savings/[id]/page";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { calculateSavingsBalance, calculateTotalMoney, calculateWalletBalance } from "@/domain/ledger";
import { emptyData, makeTarget, makeTx, makeWallet, on, at } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";

/**
 * Phase 2D — Dompet & Tabungan UX.
 *
 * These tests are about behaviour the user can rely on: balances and progress are
 * *derived* from the ledger, savings movements never change Total Money, and a
 * destructive action that the ledger refuses is reported instead of failing silently.
 * Styling is deliberately not asserted.
 */

const push = vi.fn();
const back = vi.fn();
let routeId = "bca";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back }),
  usePathname: () => "/wallets",
  useParams: () => ({ id: routeId }),
}));

function setData(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

/** One wallet funded by an opening balance, plus one savings goal. */
function walletAndGoal(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA", provider: "Bank Central Asia" })],
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
    ],
  });
}

describe("Dompet (wallets) Phase 2D UX", () => {
  beforeEach(() => {
    setData(emptyData());
    push.mockClear();
    back.mockClear();
    routeId = "bca";
  });

  it("onboards with a wallet-first empty state before any transaction can be recorded", () => {
    render(<WalletsPage />);

    expect(screen.getByText("Belum ada dompet")).toBeInTheDocument();
    expect(screen.getByText(/butuh dompet sumber atau tujuan/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat dompet pertama/i })).toHaveAttribute(
      "href",
      "/wallets/new",
    );
  });

  it("offers the contextual add action from the header", () => {
    render(<WalletsPage />);
    expect(screen.getByRole("link", { name: "Tambah" })).toHaveAttribute("href", "/wallets/new");
  });

  it("summarises wallet money only, keeping savings counted separately", () => {
    setData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
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
            id: "deposit",
            type: "savings_deposit",
            amount: 250_000,
            sourceWalletId: "bca",
            savingsTargetId: "liburan",
            date: on(2026, 9, 2),
            createdAt: at(2026, 9, 2, 8),
          }),
        ],
      }),
    );
    render(<WalletsPage />);

    const summary = screen.getByText("Total uang di dompet").closest("section") as HTMLElement;
    // Rp750.000 is wallet money; the Rp250.000 sitting in savings is called out, not added in.
    expect(within(summary).getByText("Rp750.000")).toBeInTheDocument();
    expect(within(summary).getByText(/Belum termasuk tabungan Rp250\.000/)).toBeInTheDocument();
  });

  it("renders each wallet's derived balance and metadata", () => {
    setData(walletAndGoal());
    render(<WalletsPage />);

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("BCA")).toBeInTheDocument();
    expect(within(row).getByText(/Bank · Bank Central Asia/)).toBeInTheDocument();
    expect(within(row).getByText("Rp1.000.000")).toBeInTheDocument();
    expect(within(row).getByText(/1 transaksi/)).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/wallets/bca");
  });

  it("records an opening balance as a ledger transaction rather than a stored balance", async () => {
    render(<NewWalletPage />);

    fireEvent.change(screen.getByLabelText(/Nama dompet/i), { target: { value: "GoPay" } });
    fireEvent.change(screen.getByLabelText(/Saldo awal/i), { target: { value: "150.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan dompet" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/wallets"));

    const data = useSmartSpendStore.getState().data;
    const wallet = data.wallets.find((candidate) => candidate.name === "GoPay");
    expect(wallet).toBeDefined();
    expect(data.transactions.filter((t) => t.type === "opening_balance" && t.destinationWalletId === wallet?.id)).toHaveLength(1);
    expect(calculateWalletBalance(data.transactions, wallet?.id as string)).toBe(150_000);
  });

  it("fails a wallet with no name on the field instead of writing anything", async () => {
    render(<NewWalletPage />);

    fireEvent.click(screen.getByRole("button", { name: "Simpan dompet" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(useSmartSpendStore.getState().data.wallets).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("prefills the edit form from the ledger and renames without touching history", async () => {
    setData(walletAndGoal());
    render(<EditWalletPage />);

    // the opening balance is shown because it is derived from the ledger record
    expect(screen.getByLabelText(/Saldo awal/i)).toHaveValue("1.000.000");
    // the current balance copy uses natural user-facing phrasing without jargon
    expect(screen.getByText(/saldo saat ini/i)).toBeInTheDocument();
    expect(screen.queryByText(/diturunkan dari ledger/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nama dompet/i), { target: { value: "BCA Utama" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/wallets/bca"));

    const data = useSmartSpendStore.getState().data;
    expect(data.wallets[0]?.name).toBe("BCA Utama");
    expect(data.transactions.filter((t) => t.type === "opening_balance")).toHaveLength(1);
    expect(calculateWalletBalance(data.transactions, "bca")).toBe(1_000_000);
  });

  it("exposes all four wallet actions (transaksi, ubah, arsipkan, hapus) with natural copy", () => {
    setData(walletAndGoal());
    render(<WalletDetailPage />);

    // Primary row actions
    expect(screen.getByRole("link", { name: /transaksi/i })).toHaveAttribute("href", "/transactions/new?wallet=bca");
    expect(screen.getByRole("link", { name: /ubah/i })).toHaveAttribute("href", "/wallets/bca/edit");

    // Secondary management row actions
    expect(screen.getByRole("button", { name: /arsipkan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hapus/i })).toBeInTheDocument();

    // Natural Bahasa Indonesia balance copy without "ledger" jargon
    expect(screen.getByText(/saldo saat ini/i)).toBeInTheDocument();
    expect(screen.queryByText(/dihitung dari ledger/i)).not.toBeInTheDocument();
  });

  it("surfaces the ledger's refusal instead of deleting a wallet that is still referenced", async () => {
    setData(walletAndGoal());
    render(<WalletDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Ledger menolak menghapus/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Hapus" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Gunakan Arsipkan agar riwayat tetap utuh/i);
    // the dataset is untouched and the user was not navigated away
    expect(useSmartSpendStore.getState().data.wallets).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("deletes an unused wallet and returns to the list", async () => {
    setData(emptyData({ wallets: [makeWallet("jago", { name: "Jago" })] }));
    routeId = "jago";
    render(<WalletDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/wallets"));
    expect(useSmartSpendStore.getState().data.wallets).toHaveLength(0);
  });
});

describe("Tabungan (savings) Phase 2D UX", () => {
  beforeEach(() => {
    setData(emptyData());
    push.mockClear();
    routeId = "liburan";
  });

  it("starts with a compact empty state and a goal-first action", () => {
    render(<SavingsPage />);

    expect(screen.getByText("Belum ada target tabungan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Target" })).toHaveAttribute("href", "/savings/new");
  });

  it("derives progress from deposits and marks a completed goal", () => {
    setData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        savingsTargets: [
          makeTarget("liburan", 5_000_000, { name: "Liburan" }),
          makeTarget("darurat", 1_000_000, { name: "Dana Darurat" }),
        ],
        transactions: [
          makeTx({
            id: "open",
            type: "opening_balance",
            amount: 5_000_000,
            destinationWalletId: "bca",
            date: on(2026, 9, 1),
            createdAt: at(2026, 9, 1, 8),
          }),
          makeTx({
            id: "d1",
            type: "savings_deposit",
            amount: 800_000,
            sourceWalletId: "bca",
            savingsTargetId: "liburan",
            date: on(2026, 9, 2),
            createdAt: at(2026, 9, 2, 8),
          }),
          makeTx({
            id: "d2",
            type: "savings_deposit",
            amount: 1_000_000,
            sourceWalletId: "bca",
            savingsTargetId: "darurat",
            date: on(2026, 9, 3),
            createdAt: at(2026, 9, 3, 8),
          }),
        ],
      }),
    );
    render(<SavingsPage />);

    // partial goal: derived amount, target, percent and remainder
    expect(screen.getByText("Rp800.000")).toBeInTheDocument();
    expect(screen.getByText("dari Rp5.000.000")).toBeInTheDocument();
    expect(screen.getByText(/16% · sisa Rp4\.200\.000/)).toBeInTheDocument();

    // completed goal is stated in words, not only by colour
    expect(screen.getByText("tercapai")).toBeInTheDocument();
    expect(screen.getByText("1 tercapai")).toBeInTheDocument();
    expect(screen.getByText("Rp1.800.000")).toBeInTheDocument();
  });

  it("renders a zero-progress goal without collapsing its numbers", () => {
    setData(
      emptyData({
        savingsTargets: [makeTarget("liburan", 2_000_000, { name: "Liburan" })],
      }),
    );
    render(<SavingsPage />);

    // the row itself keeps its numbers: Rp0 saved, 0% of the target, full remainder
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Rp0")).toBeInTheDocument();
    expect(within(row).getByText("dari Rp2.000.000")).toBeInTheDocument();
    expect(within(row).getByText(/0% · sisa Rp2\.000\.000/)).toBeInTheDocument();
  });

  it("handles the largest supported IDR target", () => {
    setData(
      emptyData({
        savingsTargets: [makeTarget("rumah", 9_999_999_999, { name: "Rumah" })],
      }),
    );
    render(<SavingsPage />);

    expect(screen.getByText("dari Rp9.999.999.999")).toBeInTheDocument();
  });

  it("creates a goal through the existing schema and returns to the list", async () => {
    render(<NewSavingsTargetPage />);

    fireEvent.change(screen.getByLabelText(/Nama target/i), { target: { value: "Motor" } });
    fireEvent.change(screen.getByLabelText(/Target nominal/i), { target: { value: "12.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan target" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/savings"));
    expect(useSmartSpendStore.getState().data.savingsTargets[0]).toMatchObject({
      name: "Motor",
      targetAmount: 12_000_000,
    });
  });

  it("shows the goal, source wallet and meaning, then records a deposit that never changes Total Money", async () => {
    setData(walletAndGoal());
    const before = calculateTotalMoney(
      useSmartSpendStore.getState().data.wallets,
      useSmartSpendStore.getState().data.savingsTargets,
      useSmartSpendStore.getState().data.transactions,
    ).total;

    render(<SavingsDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Setor" }));

    // the movement is anchored to the goal and labelled as internal, never an expense
    expect(screen.getByText("Setor ke tabungan")).toBeInTheDocument();
    expect(screen.getByText("Bukan pengeluaran")).toBeInTheDocument();
    expect(screen.getByText(/Uang berpindah dari dompet ke tabungan/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "250.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Setor sekarang" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/savings/liburan"));

    const data = useSmartSpendStore.getState().data;
    const deposit = data.transactions.find((t) => t.type === "savings_deposit");
    expect(deposit).toMatchObject({ amount: 250_000, sourceWalletId: "bca", savingsTargetId: "liburan" });
    expect(calculateSavingsBalance(data.transactions, "liburan")).toBe(250_000);
    expect(calculateWalletBalance(data.transactions, "bca")).toBe(750_000);
    expect(calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total).toBe(before);
  });

  it("records a withdrawal that returns money to a wallet without counting as income", async () => {
    setData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
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
            id: "deposit",
            type: "savings_deposit",
            amount: 300_000,
            sourceWalletId: "bca",
            savingsTargetId: "liburan",
            date: on(2026, 9, 2),
            createdAt: at(2026, 9, 2, 8),
          }),
        ],
      }),
    );

    render(<SavingsDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tarik" }));

    expect(screen.getByText("Tarik dari tabungan")).toBeInTheDocument();
    expect(screen.getByText("Bukan pemasukan")).toBeInTheDocument();
    expect(screen.getByText(/Uang berpindah dari tabungan ke dompet/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "100.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tarik sekarang" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/savings/liburan"));

    const data = useSmartSpendStore.getState().data;
    expect(data.transactions.find((t) => t.type === "savings_withdrawal")).toMatchObject({
      amount: 100_000,
      destinationWalletId: "bca",
    });
    expect(calculateSavingsBalance(data.transactions, "liburan")).toBe(200_000);
    expect(calculateWalletBalance(data.transactions, "bca")).toBe(800_000);
    expect(calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions).total).toBe(1_000_000);
  });

  it("refuses to withdraw more than the goal holds, leaving the ledger untouched", async () => {
    setData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
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
            id: "deposit",
            type: "savings_deposit",
            amount: 300_000,
            sourceWalletId: "bca",
            savingsTargetId: "liburan",
            date: on(2026, 9, 2),
            createdAt: at(2026, 9, 2, 8),
          }),
        ],
      }),
    );

    render(<SavingsDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tarik" }));
    fireEvent.change(screen.getByLabelText(/Nominal/i), { target: { value: "500.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tarik sekarang" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(useSmartSpendStore.getState().data.transactions.filter((t) => t.type === "savings_withdrawal")).toHaveLength(0);
    expect(calculateSavingsBalance(useSmartSpendStore.getState().data.transactions, "liburan")).toBe(300_000);
    expect(push).not.toHaveBeenCalled();
  });

  it("points at wallet creation when there is no wallet to setor from", async () => {
    setData(
      emptyData({
        savingsTargets: [makeTarget("liburan", 5_000_000, { name: "Liburan" })],
      }),
    );
    render(<SavingsDetailPage />);

    expect(screen.getByRole("button", { name: "Setor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tarik" })).toBeDisabled();
    expect(screen.getByText(/Butuh minimal satu dompet aktif/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buat dompet/i })).toHaveAttribute("href", "/wallets/new");

    // and no half-built movement form is rendered
    expect(screen.queryByRole("button", { name: "Setor sekarang" })).not.toBeInTheDocument();
  });

  it("disables editing a goal's money when it is archived, keeping its history counted", async () => {
    setData(
      emptyData({
        wallets: [makeWallet("bca", { name: "BCA" })],
        savingsTargets: [
          makeTarget("liburan", 5_000_000, { name: "Liburan", archivedAt: at(2026, 9, 9) }),
        ],
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
            id: "d1",
            type: "savings_deposit",
            amount: 700_000,
            sourceWalletId: "bca",
            savingsTargetId: "liburan",
            date: on(2026, 9, 2),
            createdAt: at(2026, 9, 2, 8),
          }),
        ],
      }),
    );
    render(<SavingsDetailPage />);

    expect(screen.getByText("arsip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Setor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tarik" })).toBeDisabled();
    // the derived balance is still reported for an archived goal (the history list below
    // reports the same money as a ledger row, so scope this to the hero)
    const hero = screen.getByText("arsip").closest("section") as HTMLElement;
    expect(within(hero).getByText("Rp700.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pulihkan dari arsip/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Pulihkan dari arsip/i }));
    await waitFor(() => expect(useSmartSpendStore.getState().data.savingsTargets[0]?.archivedAt).toBeNull());
  });
});
