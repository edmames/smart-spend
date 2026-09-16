"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TransactionFilterPanel, TransactionList, useFilteredTransactions } from "@/components/transactions/transaction-list";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateWalletBalance } from "@/domain/ledger";
import { WALLET_TYPE_LABELS } from "@/domain/models";
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
          {historyCount === 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setAsk("delete")}>
              Hapus
            </Button>
          ) : null}
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted">
          {archived
            ? "Dompet ini tidak bisa dipilih untuk transaksi baru, tapi seluruh riwayatnya tetap dihitung."
            : `Terpakai di ${historyCount} transaksi.`}
        </p>
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
        description="Dompet ini belum punya transaksi, jadi aman dihapus permanen."
        confirmLabel="Hapus"
        onConfirm={() => void deleteWallet(wallet.id)}
        onClose={() => setAsk(null)}
      />
    </>
  );
}
