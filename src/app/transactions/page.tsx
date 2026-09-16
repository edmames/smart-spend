"use client";

import { useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import {
  TransactionFilterPanel,
  TransactionList,
  useFilteredTransactions,
} from "@/components/transactions/transaction-list";
import { useWalletOptions } from "@/app/hooks";
import { useSmartSpendStore } from "@/app/store";
import { readQueryParam } from "@/lib/route-params";
import { useRouter } from "next/navigation";
import { EMPTY_FILTER, type TransactionFilterState } from "@/types";

export default function TransactionsPage() {
  const router = useRouter();
  const categoryParam = readQueryParam("category");
  const walletParam = readQueryParam("wallet");

  // The filter is *derived* state: the base filter lives in `useState`, and deep
  // link params (`?category=`, `?wallet=` from report/breakdown rows) are layered
  // on top until the user resets — no effect + setState round-trip.
  const [base, setBase] = useState<TransactionFilterState>(EMPTY_FILTER);
  const [ignoreDeepLink, setIgnoreDeepLink] = useState(false);

  const filter: TransactionFilterState = ignoreDeepLink
    ? base
    : {
        ...base,
        categoryIds: categoryParam ? [categoryParam] : base.categoryIds,
        walletIds: walletParam ? [walletParam] : base.walletIds,
      };

  const setFilter = (next: TransactionFilterState) => setBase(next);
  const clearDeepLink = () => {
    setIgnoreDeepLink(true);
    router.replace("/transactions");
  };

  const walletOptions = useWalletOptions({ includeArchived: true });
  const items = useFilteredTransactions(filter);
  const totalCount = useSmartSpendStore((state) => state.data.transactions.length);

  return (
    <>
      <PageHeader
        title="Transaksi"
        subtitle={totalCount > 0 ? `${totalCount} catatan tersimpan di perangkat ini` : "Semua pergerakan uang ada di sini"}
        actions={
          <LinkButton href="/transactions/new" size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Catat
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          {totalCount === 0 ? (
            <EmptyState
              icon={<Receipt className="h-7 w-7" />}
              title="Belum ada transaksi"
              description="Catat pemasukan, pengeluaran, transfer, atau setoran tabungan pertama Anda."
              action={
                <LinkButton href="/transactions/new">
                  <Plus className="h-4 w-4" aria-hidden />
                  Catat transaksi
                </LinkButton>
              }
            />
          ) : (
            <>
              <TransactionFilterPanel
                filter={filter}
                onChange={setFilter}
                walletOptions={walletOptions}
                onReset={clearDeepLink}
              />
              <TransactionList
                items={items}
                emptyTitle="Tidak ada transaksi yang cocok"
                emptyDescription="Coba ubah kata kunci atau reset filter."
              />
            </>
          )}
        </HydrationGate>
      </div>
    </>
  );
}
