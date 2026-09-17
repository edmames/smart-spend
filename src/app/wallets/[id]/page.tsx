"use client";

import { useState } from "react";
import { AlertTriangle, Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TransactionFilterPanel, TransactionList, useFilteredTransactions } from "@/components/transactions/transaction-list";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateWalletBalance } from "@/domain/ledger";
import { WALLET_TYPE_LABELS } from "@/domain/models";
import { useRouter } from "next/navigation";
import { EMPTY_FILTER, type TransactionFilterState } from "@/types";

export default function WalletDetailPage() {
  const id = useRouteId();
  return (
    <>
      <PageHeader title="Detail dompet" backHref="/wallets" />
      <HydrationGate>
        <WalletDetail id={id} />
      </HydrationGate>
    </>
  );
}

function WalletDetail({ id }: { id: string }) {
  const wallet = useSmartSpendStore((state) => state.data.wallets.find((candidate) => candidate.id === id));
  const walletIds = wallet ? [wallet.id] : [];
  const transactions = useSmartSpendStore((state) => state.data.transactions);
  const archiveWallet = useSmartSpendStore((state) => state.archiveWallet);
  const restoreWallet = useSmartSpendStore((state) => state.restoreWallet);
  const deleteWallet = useSmartSpendStore((state) => state.deleteWallet);
  const [filter, setFilter] = useState<TransactionFilterState>(EMPTY_FILTER);
  const [ask, setAsk] = useState<"archive" | "delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();
  const items = useFilteredTransactions(filter, { walletIds });

  if (!wallet) {
    return <EmptyState title="Dompet tidak ditemukan" description="Data dompet ini tidak ada di perangkat ini." />;
  }

  const balance = calculateWalletBalance(transactions, wallet.id);
  const historyCount = transactions.filter(
    (transaction) => transaction.sourceWalletId === wallet.id || transaction.destinationWalletId === wallet.id,
  ).length;
  const archived = wallet.archivedAt != null;

  return (
    <>
      <Card as="section" className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-extrabold text-ink">{wallet.name}</p>
            <p className="text-[12px] text-muted">
              {WALLET_TYPE_LABELS[wallet.type]}
              {wallet.provider ? ` · ${wallet.provider}` : ""}
            </p>
          </div>
          {archived ? <Badge tone="neutral">terarsip</Badge> : null}
        </div>

        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Saldo (dihitung dari ledger)</p>
          <p className="text-[26px] font-extrabold tabular text-ink">{formatIDR(balance)}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <LinkButton href={`/transactions/new?wallet=${wallet.id}`} size="sm" variant="soft">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Transaksi
          </LinkButton>
          <LinkButton href={`/wallets/${wallet.id}/edit`} size="sm" variant="secondary">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Ubah
          </LinkButton>
          {!archived ? (
            <Button size="sm" variant="secondary" onClick={() => setAsk("archive")}>
              <Archive className="h-3.5 w-3.5" aria-hidden />
              Arsipkan
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => void restoreWallet(wallet.id)}>
              <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
              Pulihkan
            </Button>
          )}
          <Button size="sm" variant={historyCount === 0 ? "ghost" : "secondary"} onClick={() => setAsk("delete")}>
            Hapus
          </Button>
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted">
          {archived
            ? "Dompet ini tidak bisa dipilih untuk transaksi baru, tapi seluruh riwayatnya tetap dihitung."
            : historyCount > 0
              ? `Terpakai di ${historyCount} transaksi — tidak bisa dihapus permanen, gunakan Arsipkan.`
              : "Belum dipakai di transaksi mana pun."}
        </p>

        {deleteError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-expense-soft px-3 py-2 text-[12px] font-semibold text-expense"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {deleteError}
          </p>
        ) : null}
      </Card>

      <SectionTitle>Riwayat transaksi</SectionTitle>
      <TransactionFilterPanel
        filter={filter}
        onChange={setFilter}
        walletOptions={[{ value: wallet.id, label: wallet.name }]}
      />
      <TransactionList
        items={items}
        emptyTitle="Belum ada transaksi di dompet ini"
        emptyDescription="Semua pemasukan, pengeluaran, transfer, dan setoran tabungan yang menyinggung dompet ini akan tampil di sini."
      />

      <ConfirmDialog
        open={ask === "archive"}
        title={`Arsipkan ${wallet.name}?`}
        description={
          <>
            Dompet dengan riwayat tidak kami hapus permanen. Mengarsipkan menyembunyikannya dari pilihan transaksi
            baru, sementara saldo historis dan laporan tetap akurat.
          </>
        }
        confirmLabel="Ya, arsipkan"
        tone="primary"
        onConfirm={() => void archiveWallet(wallet.id)}
        onClose={() => setAsk(null)}
      />

      <ConfirmDialog
        open={ask === "delete"}
        title={`Hapus ${wallet.name}?`}
        description={
          historyCount === 0
            ? "Dompet ini belum punya transaksi, jadi aman dihapus permanen."
            : `Dompet ini dipakai di ${historyCount} transaksi. Ledger menolak menghapus dompet yang masih dirujuk — pakai Arsipkan agar riwayat tetap utuh.`
        }
        confirmLabel="Hapus"
        onConfirm={() => {
          const result = deleteWallet(wallet.id);
          setAsk(null);
          if (result.ok) {
            setDeleteError(null);
            router.push("/wallets");
            return;
          }
          // The refusal is the safety feature: show it instead of a dead button.
          setDeleteError(result.error.message);
        }}
        onClose={() => setAsk(null)}
      />
    </>
  );
}
