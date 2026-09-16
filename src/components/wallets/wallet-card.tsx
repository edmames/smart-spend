"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ChevronRight } from "lucide-react";
import { Badge, Card } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { WALLET_TYPE_ICONS } from "@/domain/categories";
import { WALLET_TYPE_LABELS, type Wallet } from "@/domain/models";
import { formatIDR } from "@/domain/money";
import { useSmartSpendStore } from "@/app/store";
import { calculateWalletBalance } from "@/domain/ledger";
import { useMemo } from "react";

/**
 * Wallet row used by the list, the detail header and the dashboard.
 * The balance is always derived — this component computes it, it never reads a
 * stored one (there is no `wallet.balance` in the model).
 */
export function WalletCard({ wallet, showArchive = true }: { wallet: Wallet; showArchive?: boolean }) {
  const transactions = useSmartSpendStore((state) => state.data.transactions);
  const archiveWallet = useSmartSpendStore((state) => state.archiveWallet);
  const restoreWallet = useSmartSpendStore((state) => state.restoreWallet);
  const archived = wallet.archivedAt != null;

  const { balance, count } = useMemo(
    () => ({
      balance: calculateWalletBalance(transactions, wallet.id),
      count: transactions.filter(
        (transaction) => transaction.sourceWalletId === wallet.id || transaction.destinationWalletId === wallet.id,
      ).length,
    }),
    [transactions, wallet.id],
  );


  return (
    <Card as="li" className="flex items-center gap-3 !p-2">
      <Link
        href={`/wallets/${wallet.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-1 transition hover:bg-brand-soft/40"
      >
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas",
            archived && "opacity-60",
          )}
        >
          {(() => {
            const Icon = WALLET_TYPE_ICONS[wallet.type];
            return Icon ? <Icon className="h-5 w-5 text-ink" strokeWidth={1.9} /> : null;
          })()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14.5px] font-bold text-ink">{wallet.name}</span>
            {archived ? <Badge tone="neutral">arsip</Badge> : null}
          </span>
          <span className="truncate text-[12px] text-muted">
            {WALLET_TYPE_LABELS[wallet.type]}
            {wallet.provider ? ` · ${wallet.provider}` : ""} · {count} transaksi
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span
            className={cn(
              "text-[14.5px] font-extrabold tabular",
              balance < 0 ? "text-expense" : "text-ink",
              archived && "text-muted",
            )}
          >
            {formatIDR(balance)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand">
            detail
            <ChevronRight className="h-3 w-3" aria-hidden />
          </span>
        </span>
      </Link>

      {showArchive && !archived ? (
        <button
          type="button"
          onClick={() => void archiveWallet(wallet.id)}
          aria-label={`Arsipkan ${wallet.name}`}
          title="Arsipkan dompet"
          className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-ink"
        >
          <Archive className="h-4 w-4" />
        </button>
      ) : null}

      {showArchive && archived ? (
        <button
          type="button"
          onClick={() => void restoreWallet(wallet.id)}
          aria-label={`Pulihkan ${wallet.name}`}
          title="Pulihkan dari arsip"
          className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-ink"
        >
          <ArchiveRestore className="h-4 w-4" />
        </button>
      ) : null}
    </Card>
  );
}
