"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TransactionForm } from "@/app/forms/transaction-form";
import {
  describeTransaction,
  formatTransactionDate,
  TransactionIcon,
  transactionSignKind,
} from "@/components/transactions/transaction-row";
import { useDescribeContext } from "@/components/transactions/transaction-row";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import { categoryLabel, TRANSACTION_TYPE_LABELS } from "@/domain/categories";
import { PAYMENT_METHOD_LABELS } from "@/domain/models";
import { formatIDR, formatSignedIDR } from "@/domain/money";
import { useRouter } from "next/navigation";

export default function TransactionDetailPage() {
  const id = useRouteId();
  return (
    <>
      <PageHeader title="Detail transaksi" backHref="/transactions" />
      <HydrationGate>
        <TransactionDetail id={id} />
      </HydrationGate>
    </>
  );
}

function TransactionDetail({ id }: { id: string }) {
  const transaction = useSmartSpendStore((state) => state.data.transactions.find((t) => t.id === id));
  const deleteTransaction = useSmartSpendStore((state) => state.deleteTransaction);
  const wallets = useSmartSpendStore((state) => state.data.wallets);
  const context = useDescribeContext();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!transaction) {
    return (
      <EmptyState
        title="Transaksi tidak ditemukan"
        description="Catatan ini tidak ada di perangkat ini — mungkin sudah dihapus atau file cadangan belum diimpor."
      />
    );
  }

  const involved = [transaction.sourceWalletId, transaction.destinationWalletId].filter(
    (value): value is string => typeof value === "string",
  );
  const archivedInvolved = wallets.filter((wallet) => involved.includes(wallet.id) && wallet.archivedAt != null);
  const signKind = transactionSignKind(transaction);
  const summary = describeTransaction(transaction, context);

  return (
    <>
      <Card as="section" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <TransactionIcon transaction={transaction} className="h-5 w-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <Badge tone={toneFor(transaction.type)}>{TRANSACTION_TYPE_LABELS[transaction.type]}</Badge>
              <p className="text-[27px] font-extrabold leading-tight tabular text-ink">
                {formatSignedIDR(transaction.amount, signKind)}
              </p>
              <p className="text-[13px] leading-snug text-muted">{summary}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" variant={editing ? "soft" : "secondary"} onClick={() => setEditing((value) => !value)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {editing ? "Tutup" : "Ubah"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAskDelete(true)} aria-label="Hapus transaksi">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <dl className="flex flex-col divide-y divide-line/70 text-[13px]">
          <Row label="Jenis">{TRANSACTION_TYPE_LABELS[transaction.type]}</Row>
          <Row label="Uraian">{summary}</Row>
          {transaction.categoryId ? <Row label="Kategori">{categoryLabel(transaction.categoryId)}</Row> : null}
          {transaction.paymentMethod ? (
            <Row label="Metode">{PAYMENT_METHOD_LABELS[transaction.paymentMethod]}</Row>
          ) : null}
          <Row label="Tanggal">{formatTransactionDate(transaction.date)}</Row>
          <Row label="Catatan">{transaction.note && transaction.note.length > 0 ? transaction.note : "—"}</Row>
          <Row label="Dibuat">{formatTransactionDate(transaction.createdAt)}</Row>
          {transaction.updatedAt !== transaction.createdAt ? (
            <Row label="Diubah">{formatTransactionDate(transaction.updatedAt)}</Row>
          ) : null}
        </dl>

        {archivedInvolved.length > 0 ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-[12px] text-warning">
            Transaksi ini menyentuh dompet terarsip ({archivedInvolved.map((w) => w.name).join(", ")}). Saldo
            historisnya tetap dihitung seperti biasa.
          </p>
        ) : null}

        {transaction.type === "transfer" ||
        transaction.type === "savings_deposit" ||
        transaction.type === "savings_withdrawal" ? (
          <p className="text-[11.5px] leading-relaxed text-muted">
            Ini pergerakan internal: total uang Anda tidak berubah, dan transaksi ini tidak dihitung sebagai
            pemasukan/pengeluaran bulan ini.
          </p>
        ) : null}

        {deleteError ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-expense-soft px-3 py-2 text-[12px] font-semibold text-expense">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {deleteError}
          </p>
        ) : null}
      </Card>

      {editing ? (
        <>
          <SectionTitle>Ubah transaksi</SectionTitle>
          <TransactionForm mode="edit" transaction={transaction} />
          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            Perubahan divalidasi terhadap seluruh riwayat (bukan hanya transaksi ini). Jika membuat saldo negatif di
            masa lalu, perubahan ditolak dan data lama tetap utuh.
          </p>
        </>
      ) : null}

      <ConfirmDialog
        open={askDelete}
        title="Hapus transaksi ini?"
        description={
          <>
            Anda akan menghapus <strong>{TRANSACTION_TYPE_LABELS[transaction.type]}</strong> sebesar{" "}
            <strong>{formatIDR(transaction.amount)}</strong> pada {formatTransactionDate(transaction.date)}.
          </>
        }
        requirePhrase="HAPUS"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={() => {
          const result = deleteTransaction(transaction.id);
          if (result.ok) {
            setDeleteError(null);
            router.push("/transactions");
            return;
          }
          setDeleteError(result.error.message);
        }}
        onClose={() => setAskDelete(false)}
      >
        <div className="rounded-xl border border-line bg-elevated px-3 py-2">
          <p className="text-[12px] font-semibold text-ink">{summary}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Saldo, ringkasan bulanan, dan pemakaian budget akan dihitung ulang. Jika riwayat menjadi tidak valid,
            domain akan menolak penghapusan.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

function toneFor(type: string): "income" | "expense" | "savings" | "brand" | "neutral" {
  if (type === "income" || type === "opening_balance") return "income";
  if (type === "expense") return "expense";
  if (type === "savings_deposit" || type === "savings_withdrawal") return "savings";
  if (type === "transfer") return "brand";
  return "neutral";
}
