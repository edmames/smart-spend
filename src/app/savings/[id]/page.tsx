"use client";

import { formatCalendarDate } from "@/domain/calendar";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Pencil, PiggyBank } from "lucide-react";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, ProgressBar, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { SavingsMovementForm, SavingsTargetForm } from "@/app/forms/savings-forms";
import { TransactionList, useFilteredTransactions } from "@/components/transactions/transaction-list";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateSavingsProgress } from "@/domain/selectors";
import { EMPTY_FILTER, type TransactionFilterState } from "@/types";

export default function SavingsDetailPage() {
  const id = useRouteId();
  return (
    <>
      <PageHeader title="Detail tabungan" backHref="/savings" />
      <HydrationGate>
        <SavingsDetail id={id} />
      </HydrationGate>
    </>
  );
}

function SavingsDetail({ id }: { id: string }) {
  const target = useSmartSpendStore((state) => state.data.savingsTargets.find((candidate) => candidate.id === id));
  const transactions = useSmartSpendStore((state) => state.data.transactions);
  const wallets = useSmartSpendStore((state) => state.data.wallets);
  const archiveSavingsTarget = useSmartSpendStore((state) => state.archiveSavingsTarget);
  const restoreSavingsTarget = useSmartSpendStore((state) => state.restoreSavingsTarget);
  const [mode, setMode] = useState<"none" | "deposit" | "withdrawal" | "edit">("none");
  const [askArchive, setAskArchive] = useState(false);
  const [filter] = useState<TransactionFilterState>(EMPTY_FILTER);

  const targetIds = target ? [target.id] : [];
  const items = useFilteredTransactions(filter, { savingsTargetIds: targetIds });

  if (!target) {
    return <EmptyState title="Target tabungan tidak ditemukan" description="Target ini tidak ada di perangkat ini." />;
  }

  const progress = calculateSavingsProgress(target, transactions);
  const archived = target.archivedAt != null;
  const activeWallets = wallets.filter((wallet) => wallet.archivedAt == null);

  return (
    <>
      <Card as="section" className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[17px] font-extrabold text-ink">
              <PiggyBank className="h-4 w-4 shrink-0 text-savings" aria-hidden />
              {target.name}
            </p>
            <p className="text-[12px] text-muted">
              {target.deadline
                ? `Tenggat ${formatCalendarDate(target.deadline)}`
                : "Tanpa tenggat"}
            </p>
          </div>
          {archived ? <Badge tone="neutral">arsip</Badge> : progress.goalReached ? <Badge tone="income">tercapai</Badge> : null}
        </div>

        <div>
          <p className="text-[26px] font-extrabold leading-tight tabular text-ink">{formatIDR(progress.saved)}</p>
          <p className="text-[12px] tabular text-muted">
            dari target {formatIDR(progress.targetAmount)}
            {progress.percentActual > 100 ? ` · ${progress.percentActual.toFixed(0)}% (lebih dari target, boleh)` : ""}
          </p>
        </div>

        <ProgressBar percent={progress.percentCapped} tone={progress.goalReached ? "income" : "savings"} />

        <p className="text-[12px] text-muted">
          {progress.goalReached ? "Target tercapai — Anda tetap bisa menambah setoran." : `Kurang ${formatIDR(progress.remaining)}.`}
        </p>

        {target.note ? (
          <p className="rounded-xl bg-canvas px-3 py-2 text-[12.5px] text-ink">{target.note}</p>
        ) : null}

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <Button size="sm" onClick={() => setMode(mode === "deposit" ? "none" : "deposit")} disabled={archived || activeWallets.length === 0}>
            <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
            Setor
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode(mode === "withdrawal" ? "none" : "withdrawal")} disabled={archived || progress.saved <= 0 || activeWallets.length === 0}>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            Tarik
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode(mode === "edit" ? "none" : "edit")}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Ubah
          </Button>
          {archived ? (
            <Button size="sm" variant="ghost" onClick={() => void restoreSavingsTarget(target.id)}>
              Pulihkan dari arsip
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAskArchive(true)}>
              Arsipkan
            </Button>
          )}
        </div>

        {archived ? (
          <p className="text-[11.5px] text-muted">
            Target terarsip tidak bisa disetor/ditarik, tapi riwayat dan saldonya tetap dihitung.
          </p>
        ) : activeWallets.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-warning">
            Butuh minimal satu dompet aktif untuk menyetor atau menarik.{" "}
            <LinkButton href="/wallets/new" size="sm" variant="secondary">
              Buat dompet
            </LinkButton>
          </p>
        ) : null}
      </Card>

      {mode === "deposit" || mode === "withdrawal" ? (
        <>
          <SectionTitle>{mode === "deposit" ? "Setor ke tabungan" : "Tarik dari tabungan"}</SectionTitle>
          <SavingsMovementForm target={target} direction={mode} />
        </>
      ) : null}

      {mode === "edit" ? (
        <>
          <SectionTitle>Ubah target</SectionTitle>
          <SavingsTargetForm mode="edit" target={target} />
        </>
      ) : null}

      <SectionTitle>Riwayat setoran & penarikan</SectionTitle>
      <TransactionList
        items={items}
        emptyTitle="Belum ada pergerakan"
        emptyDescription="Setoran dari dompet akan menambah saldo target ini; penarikan akan menguranginya."
      />

      <ConfirmDialog
        open={askArchive}
        title={`Arsipkan ${target.name}?`}
        description="Riwayat setoran dan penarikan tetap dihitung; target hanya hilang dari daftar pilihan."
        confirmLabel="Ya, arsipkan"
        tone="primary"
        onConfirm={() => {
          void archiveSavingsTarget(target.id);
          setAskArchive(false);
        }}
        onClose={() => setAskArchive(false)}
      />
    </>
  );
}
