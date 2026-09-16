"use client";

import { useMemo } from "react";
import { PageHeader, Card } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TransactionForm } from "@/app/forms/transaction-form";
import { readQueryParam } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import type { TransactionFormKind } from "@/app/forms/schemas";

/**
 * `/transactions/new` — the main data-entry screen.
 *
 * `?wallet=` (set from a wallet detail page) presets and locks the relevant
 * wallet, and `?kind=` preselects the transaction type, so users coming from
 * another screen don't re-pick what we already know.
 */
export default function NewTransactionPage() {
  const kind = (readQueryParam("kind") || "expense") as TransactionFormKind;
  const walletParam = readQueryParam("wallet");
  const savingsParam = readQueryParam("target");
  const wallets = useSmartSpendStore((state) => state.data.wallets);
  // Derived (not state): a deep link must never cause a second render pass.
  const preset = useMemo(() => {
    if (!walletParam) return null;
    const wallet = wallets.find((candidate) => candidate.id === walletParam);
    return wallet ? { walletId: wallet.id } : null;
  }, [walletParam, wallets]);

  const validKind: TransactionFormKind = (
    ["income", "expense", "transfer", "savings_deposit", "savings_withdrawal"] as TransactionFormKind[]
  ).includes(kind)
    ? kind
    : "expense";

  return (
    <>
      <PageHeader title="Catat transaksi" subtitle="Nominal selalu disimpan sebagai rupiah utuh (bilangan bulat)." backHref="/transactions" />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          {preset ? (
            <Card as="section" className="bg-brand-soft/50 text-[12.5px] text-ink">
              Terpilih dari dompet{" "}
              <strong>{wallets.find((wallet) => wallet.id === preset.walletId)?.name ?? "—"}</strong>. Anda masih bisa
              mengubahnya.
            </Card>
          ) : null}
          <TransactionForm
            mode="create"
            initialKind={validKind}
            fixedSourceWalletId={preset?.walletId}
            fixedSavingsTargetId={savingsParam || undefined}
          />
        </HydrationGate>
      </div>
    </>
  );
}
