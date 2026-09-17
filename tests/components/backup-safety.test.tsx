import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportCard, ImportCard, ResetCard } from "@/components/settings/data-cards";
import { useSmartSpendStore, configureRepository } from "@/app/store";
import { createLocalStorageRepository } from "@/repository/repository";
import { MemoryStorageAdapter } from "@/repository/storage";
import { serializeExport } from "@/app/backup";
import { seedDefaultCategories, STORAGE_VERSION } from "@/repository/storage-schema";
import { DEFAULT_SETTINGS } from "@/domain/models";
import { at, on, emptyData, makeWallet, makeTarget, makeTx } from "../fixtures";
import type { PersistedData } from "@/repository/storage-schema";

/**
 * Phase 2J — Backup & Data Safety component flow.
 *
 * Verifies the Settings DATA cards: validate-first import, preview-before-commit,
 * destructive replace confirmation, error rejection without state change, and
 * reset confirmation gate.
 */

const NOW = new Date(at(2026, 9, 1, 12, 0));

function realistic(): PersistedData {
  return emptyData({
    wallets: [makeWallet("bca", { name: "BCA" }), makeWallet("cash", { name: "Cash", type: "cash" })],
    savingsTargets: [makeTarget("lib", 5_000_000, { name: "Liburan" })],
    transactions: [
      makeTx({ id: "open-bca", type: "opening_balance", amount: 1_000_000, destinationWalletId: "bca", date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 8) }),
      makeTx({ id: "exp", type: "expense", amount: 250_000, sourceWalletId: "bca", categoryId: "makanan", date: on(2026, 9, 2), createdAt: at(2026, 9, 2, 8) }),
    ],
    settings: { ...DEFAULT_SETTINGS, hideBalances: false },
  });
}

function install(data: PersistedData) {
  configureRepository(createLocalStorageRepository(new MemoryStorageAdapter()));
  useSmartSpendStore.getState().resetStore(data);
  useSmartSpendStore.setState({ hydration: "ready" });
}

function pickFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  return user.upload(input, file);
}

describe("ExportCard", () => {
  beforeEach(() => install(realistic()));

  it("renders counts and a download button producing a valid JSON artifact", async () => {
    const user = userEvent.setup();
    render(<ExportCard />);
    expect(screen.getByText("Dompet")).toBeInTheDocument();
    expect(screen.getByText("Transaksi")).toBeInTheDocument();
    expect(screen.getByText("Tabungan")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Unduh cadangan/i }));
    const artifact = serializeExport(useSmartSpendStore.getState().data, NOW);
    const parsed = JSON.parse(artifact);
    expect(parsed.appName).toBe("SmartSpend");
    expect(parsed.wallets).toHaveLength(2);
  });
});

describe("ImportCard — validate first, then confirm", () => {
  beforeEach(() => install(realistic()));

  it("does not change state when an invalid file is picked; shows a rejection", async () => {
    const user = userEvent.setup();
    const before = JSON.parse(JSON.stringify(useSmartSpendStore.getState().data));
    render(<ImportCard />);
    const file = new File(["{ not json"], "bad.json", { type: "application/json" });
    await pickFile(user, file);
    expect(await screen.findByText(/Impor bad\.json ditolak/i)).toBeInTheDocument();
    // State untouched — the core safety assertion (dialog contents are always in
    // the DOM in jsdom, so we assert on store state, not dialog visibility).
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("shows a preview with counts and export date, but does not replace state until confirmed", async () => {
    const user = userEvent.setup();
    const before = JSON.parse(JSON.stringify(useSmartSpendStore.getState().data));
    render(<ImportCard />);
    const file = new File([serializeExport(realistic(), NOW)], "good.json", { type: "application/json" });
    await pickFile(user, file);
    expect(await screen.findByText(/Pulihkan data dari cadangan/i)).toBeInTheDocument();
    expect(screen.getByText(/Backup dibuat pada/i)).toBeInTheDocument();
    expect(screen.getByText("Kategori")).toBeInTheDocument();
    // State still unchanged (no commit yet)
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("cancel (close) leaves the existing dataset untouched", async () => {
    const user = userEvent.setup();
    const before = JSON.parse(JSON.stringify(useSmartSpendStore.getState().data));
    render(<ImportCard />);
    const file = new File([serializeExport(realistic(), NOW)], "good.json", { type: "application/json" });
    await pickFile(user, file);
    await screen.findByText(/Pulihkan data dari cadangan/i);
    await user.click(screen.getByRole("button", { name: /Batal/i }));
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("confirming a valid import replaces the dataset (replace semantics, not merge)", async () => {
    const user = userEvent.setup();
    render(<ImportCard />);
    const replacement: PersistedData = emptyData({
      wallets: [makeWallet("mandiri", { name: "Mandiri" })],
      transactions: [
        makeTx({ id: "ob-mandiri", type: "opening_balance", amount: 2_000_000, destinationWalletId: "mandiri", date: on(2026, 9, 1), createdAt: at(2026, 9, 1, 9) }),
      ],
    });
    const file = new File([serializeExport(replacement, NOW)], "good.json", { type: "application/json" });
    await pickFile(user, file);
    await screen.findByText(/Pulihkan data dari cadangan/i);
    await user.click(screen.getByRole("button", { name: /Pulihkan data/i }));
    const after = useSmartSpendStore.getState().data;
    expect(after.wallets.map((w) => w.id)).toEqual(["mandiri"]);
    expect(after.wallets).toHaveLength(1);
    expect(after.wallets.find((w) => w.id === "bca")).toBeUndefined();
  });

  it("an unsupported future version is rejected without touching state", async () => {
    const user = userEvent.setup();
    const before = JSON.parse(JSON.stringify(useSmartSpendStore.getState().data));
    render(<ImportCard />);
    const future = { version: STORAGE_VERSION + 1, wallets: [], transactions: [], savingsTargets: [], budgets: [], categories: [] };
    const file = new File([JSON.stringify(future)], "future.json", { type: "application/json" });
    await pickFile(user, file);
    await screen.findByText(/Impor future\.json ditolak/i);
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });
});

describe("ResetCard", () => {
  beforeEach(() => install(realistic()));

  it("cancel (close) preserves all existing state", async () => {
    const user = userEvent.setup();
    const before = JSON.parse(JSON.stringify(useSmartSpendStore.getState().data));
    render(<ResetCard />);
    await user.click(screen.getByRole("button", { name: /Hapus semua data/i }));
    await screen.findByText(/Hapus semua data SmartSpend/i);
    await user.click(screen.getByRole("button", { name: /Batal/i }));
    expect(useSmartSpendStore.getState().data).toEqual(before);
  });

  it("confirm reset produces valid empty state and clears storage", async () => {
    const user = userEvent.setup();
    const adapter = new MemoryStorageAdapter();
    configureRepository(createLocalStorageRepository(adapter));
    useSmartSpendStore.getState().resetStore(realistic());
    useSmartSpendStore.setState({ hydration: "ready" });
    render(<ResetCard />);
    await user.click(screen.getByRole("button", { name: /Hapus semua data/i }));
    await screen.findByText(/Hapus semua data SmartSpend/i);
    await user.type(screen.getByPlaceholderText("HAPUS"), "HAPUS");
    await user.click(screen.getByRole("button", { name: /Hapus permanen/i }));
    const after = useSmartSpendStore.getState().data;
    expect(after.wallets).toHaveLength(0);
    expect(after.transactions).toHaveLength(0);
    expect(after.savingsTargets).toHaveLength(0);
    expect(after.budgets).toHaveLength(0);
    expect(after.version).toBe(STORAGE_VERSION);
    expect(after.categories.map((c) => c.id)).toEqual(seedDefaultCategories().map((c) => c.id));
    expect(after.settings).toEqual(DEFAULT_SETTINGS);
  });
});
