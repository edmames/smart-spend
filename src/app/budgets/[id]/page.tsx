"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { BudgetForm } from "@/app/forms/budget-form";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";
import { categoryLabel, getCategoryIcon, getCategoryMeta } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import { calculateBudgetUsage, formatMonthLabel, monthKeyOf } from "@/domain/selectors";
import { colorFor } from "@/components/ui/theme";
import { sortTransactions } from "@/domain/ledger";
import { cn } from "@/lib/cn";

function renderCategoryIcon(categoryId: string | null | undefined, className?: string) {
  const Icon = getCategoryIcon(categoryId);
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

export default function BudgetDetailPage() {
  const id = useRouteId();
  return (
    <>
      <PageHeader title="Detail budget" backHref="/budgets" />
      <HydrationGate>
        <BudgetDetail id={id} />
      </HydrationGate>
    </>
  );
}

function BudgetDetail({ id }: { id: string }) {
  const router = useRouter();
  const data = useSmartSpendStore((state) => state.data);
  const deleteBudget = useSmartSpendStore((state) => state.deleteBudget);
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  const budget = data.budgets.find((b) => b.id === id);

  if (!budget) {
    return (
      <EmptyState
        title="Budget tidak ditemukan"
        description="Data budget ini tidak ada di perangkat ini atau mungkin telah dihapus."
        action={
          <Button onClick={() => router.push("/budgets")}>
            Kembali ke Budget
          </Button>
        }
      />
    );
  }

  const usage = calculateBudgetUsage(budget, data.transactions, budget.month);
  const meta = getCategoryMeta(budget.categoryId);
  const color = colorFor(meta?.color);

  const stateInfo = usage.overBudget
    ? {
        state: "MELEBIHI ANGGARAN",
        tone: "expense" as const,
        detail: `${formatIDR(usage.spent - usage.limit)} melebihi batas`,
      }
    : usage.percent >= 80
      ? {
          state: "MENDEKATI BATAS",
          tone: "warning" as const,
          detail: `${formatIDR(usage.remaining)} tersisa`,
        }
      : {
          state: "AMAN",
          tone: "income" as const,
          detail: `${formatIDR(usage.remaining)} tersisa`,
        };

  const matchingTransactions = sortTransactions(
    data.transactions.filter(
      (t) => t.type === "expense" && t.categoryId === budget.categoryId && monthKeyOf(t.date) === budget.month,
    ),
  );

  return (
    <>
      <Card as="section" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                color.soft,
                color.border,
              )}
            >
              {renderCategoryIcon(budget.categoryId, cn("h-5 w-5", color.text))}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold text-ink">{categoryLabel(budget.categoryId)}</p>
              <p className="text-[12px] text-muted">{formatMonthLabel(budget.month)}</p>
            </div>
          </div>
          <Badge tone={stateInfo.tone}>{stateInfo.state}</Badge>
        </div>

        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Batas anggaran</p>
          <p className="text-[26px] font-extrabold tabular text-ink">{formatIDR(budget.limitAmount)}</p>
        </div>

        <ProgressBar
          percent={usage.percent}
          tone={stateInfo.tone}
          label={`Budget ${categoryLabel(budget.categoryId)}`}
        />

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-2.5 text-[12.5px]">
          <div>
            <p className="text-[11.5px] font-medium text-muted">Terpakai</p>
            <p className="mt-0.5 font-bold tabular text-ink">{formatIDR(usage.spent)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11.5px] font-medium text-muted">
              {usage.overBudget ? "Melebihi batas" : "Sisa anggaran"}
            </p>
            <p className={cn("mt-0.5 font-bold tabular", usage.overBudget ? "text-expense" : "text-income")}>
              {stateInfo.detail}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <Button size="sm" variant={editing ? "soft" : "secondary"} block onClick={() => setEditing(!editing)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {editing ? "Tutup" : "Ubah"}
          </Button>
          <Button size="sm" variant="secondary" block onClick={() => setAskDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Hapus
          </Button>
        </div>
      </Card>

      {editing ? (
        <>
          <SectionTitle>Ubah budget</SectionTitle>
          <BudgetForm
            mode="edit"
            budget={budget}
            defaultMonth={budget.month}
            onCancel={() => setEditing(false)}
            onSuccess={() => setEditing(false)}
          />
        </>
      ) : null}

      <SectionTitle>Transaksi pengeluaran ({matchingTransactions.length})</SectionTitle>

      {matchingTransactions.length === 0 ? (
        <EmptyState
          title="Belum ada pengeluaran"
          description={`Belum ada transaksi pengeluaran kategori ${categoryLabel(budget.categoryId)} pada ${formatMonthLabel(budget.month)}.`}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {matchingTransactions.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} href={`/transactions/${tx.id}`} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={askDelete}
        title={`Hapus budget ${categoryLabel(budget.categoryId)}?`}
        description="Hanya batas anggarannya yang dihapus. Seluruh transaksi pengeluaran tetap utuh di catatan keuangan."
        confirmLabel="Hapus"
        onConfirm={() => {
          deleteBudget(budget.id);
          setAskDelete(false);
          router.push("/budgets");
        }}
        onClose={() => setAskDelete(false)}
      />
    </>
  );
}
