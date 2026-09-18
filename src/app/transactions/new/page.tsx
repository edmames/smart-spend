"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
import { PageHeader, Card, EmptyState, LinkButton, LoadingPanel } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { TransactionForm } from "@/app/forms/transaction-form";
import { useSmartSpendStore } from "@/app/store";
import { USER_TRANSACTION_FORM_KINDS, type TransactionFormKind } from "@/app/forms/schemas";

/**
 * `/transactions/new` — the main data-entry screen.
 *
 * `?wallet=` (set from a wallet detail page) presets and locks the relevant
 * wallet, `?target=` presets the savings goal, and `?kind=` preselects the
 * transaction type, so users coming from another screen don't re-pick what we
 * already know.
 *
 * The query string is read through `useSearchParams` — the router's own value for
 * the tree being rendered — and deliberately NOT through `window.location.search`.
 * On a soft navigation the App Router commits the new URL in an insertion effect,
 * i.e. *after* the new route has already rendered, so a render-time read of the
 * global still sees the previous screen's URL: the Dashboard's `?kind=transfer`
 * silently fell back to the default "expense" (a full reload looked fine, which is
 * why the bug only appeared when tapping through). Reading the router's value also
 * means there is no effect-based correction, so the picker never flashes from
 * Transfer to Expense after hydration.
 *
 * The default when no (or an unusable) `kind` is present stays "expense": a deep
 * link overrides the initial selection, it never changes the preference.
 */
export default function NewTransactionPage() {
  return (
    <>
      <PageHeader title="Catat transaksi" subtitle="Pilih jenis transaksi, lalu isi nominal dan dompet." backHref="/transactions" />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          {/*
            A statically prerendered route must keep `useSearchParams` inside a
            Suspense boundary. Nothing is ever visible from this fallback: the body
            only mounts after the store is hydrated, and the router already has the
            search params on the client, so the boundary never suspends at runtime.
          */}
          <Suspense fallback={<LoadingPanel />}>
            <NewTransactionBody />
          </Suspense>
        </HydrationGate>
      </div>
    </>
  );
}

function NewTransactionBody() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") ?? "";
  const walletParam = searchParams.get("wallet") ?? "";
  const savingsParam = searchParams.get("target") ?? "";
  const wallets = useSmartSpendStore((state) => state.data.wallets);
  const activeWallets = wallets.filter((wallet) => wallet.archivedAt == null);
  // Derived (not state): a deep link must never cause a second render pass.
  const preset = useMemo(() => {
    if (!walletParam) return null;
    const wallet = wallets.find((candidate) => candidate.id === walletParam);
    return wallet ? { walletId: wallet.id } : null;
  }, [walletParam, wallets]);

  const validKind: TransactionFormKind = (USER_TRANSACTION_FORM_KINDS as readonly string[]).includes(kind)
    ? (kind as TransactionFormKind)
    : "expense";

  if (activeWallets.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-7 w-7" />}
        title="Buat dompet dulu"
        description="Transaksi membutuhkan dompet sumber atau tujuan. Setelah ada dompet, form Catat bisa digunakan."
        action={
          <LinkButton href="/wallets/new">
            <Plus className="h-4 w-4" aria-hidden />
            Buat dompet
          </LinkButton>
        }
      />
    );
  }

  return (
    <>
      {preset ? (
        <Card as="section" className="bg-brand-soft/50 text-[12.5px] text-ink">
          Terpilih dari dompet <strong>{wallets.find((wallet) => wallet.id === preset.walletId)?.name ?? "—"}</strong>.
          Anda masih bisa mengubahnya.
        </Card>
      ) : null}
      <TransactionForm
        mode="create"
        initialKind={validKind}
        fixedSourceWalletId={preset?.walletId}
        fixedSavingsTargetId={savingsParam || undefined}
      />
    </>
  );
}
