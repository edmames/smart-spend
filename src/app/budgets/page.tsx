"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { clampMonth, formatMonthLabel } from "@/app/forms/month";
import { MonthPicker } from "@/components/summary/summary";
import { BudgetForm } from "@/app/forms/budget-form";
import { useSmartSpendStore } from "@/app/store";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import { calculateBudgetUsage, calculateCategoryBreakdown, currentMonthKey } from "@/domain/selectors";
import { cn } from "@/lib/cn";
import { Wallet } from "lucide-react";

export default function BudgetsPage() {
  return (
    <>
      <PageHeader title="Budget" subtitle="Satu batas per kategori per bulan, dihitung dari pengeluaran nyata saja." backHref="/more" />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          <BudgetsMonth />
        </HydrationGate>
      </div>
    </>
  );
}

function BudgetsMonth() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const data = useSmartSpendStore((state) => state.data);
  const deleteBudget = useSmartSpendStore((state) => state.deleteBudget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const budgets = data.budgets.filter((budget) => budget.month === monthKey);
  const usages = budgets.map((budget) => calculateBudgetUsage(budget, data.transactions, monthKey));
  const totalLimit = usages.reduce((sum, usage) => sum + usage.limit, 0);
  const totalSpent = usages.reduce((sum, usage) => sum + usage.spent, 0);
  const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey });
  const unbudgeted = breakdown.filter(
    (entry) => entry.categoryId && !budgets.some((budget) => budget.categoryId === entry.categoryId),
  );

  return (
    <>
      <MonthPicker monthKey={monthKey} onChange={(next) => setMonthKey(clampMonth(next))} />

      {budgets.length === 0 && !showCreate ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title={`Belum ada budget untuk ${formatMonthLabel(monthKey)}`}
          description="Tentukan batas per kategori; pemakaian akan dihitung otomatis dari pengeluaran (tanpa menghitung transfer & setoran tabungan)."
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Buat budget
            </Button>
          }
        />
      ) : null}

      {budgets.length > 0 ? (
        <>
          <Card as="section" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Total budget {formatMonthLabel(monthKey)}</p>
              <Badge tone={totalSpent > totalLimit ? "expense" : "income"}>
                {totalLimit > 0 ? `${((totalSpent / totalLimit) * 100).toFixed(0)}%` : "—"}
              </Badge>
            </div>
            <p className="text-[20px] font-extrabold tabular text-ink">
              {formatIDR(totalSpent)} <span className="text-[13px] font-semibold text-muted">/ {formatIDR(totalLimit)}</span>
            </p>
            <ProgressBar percent={totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0} tone={totalSpent > totalLimit ? "expense" : "brand"} />
            <p className="text-[11.5px] text-muted">
              {totalSpent > totalLimit
                ? `Melebihi ${formatIDR(totalSpent - totalLimit)} dari total budget bulan ini.`
                : `Sisa ${formatIDR(totalLimit - totalSpent)}.`}
            </p>
          </Card>

          <SectionTitle
            action={
              <Button size="sm" variant="soft" onClick={() => setShowCreate((value) => !value)}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Budget
              </Button>
            }
          >
            Per kategori
          </SectionTitle>

          <ul className="flex flex-col gap-2">
            {usages.map((usage) => (
              <Card as="li" key={usage.budget.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold text-ink">
                      {categoryLabel(usage.budget.categoryId)}
                    </p>
                    <p className="text-[12px] tabular text-muted">
                      {formatIDR(usage.spent)} dari {formatIDR(usage.limit)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={usage.overBudget ? "expense" : usage.percent >= 80 ? "warning" : "income"}>
                      {usage.overBudget ? `+${formatIDR(-usage.remaining)}` : formatIDR(usage.remaining)}
                    </Badge>
                    <button
                      type="button"
                      aria-label={`Ubah budget ${categoryLabel(usage.budget.categoryId)}`}
                      onClick={() => setEditingId(editingId === usage.budget.id ? null : usage.budget.id)}
                      className={cn(
                        "inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-ink",
                        editingId === usage.budget.id && "bg-brand-soft text-brand-strong",
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus budget ${categoryLabel(usage.budget.categoryId)}`}
                      onClick={() => setConfirmDelete(usage.budget.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-expense-soft hover:text-expense"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <ProgressBar percent={usage.percent} tone={usage.overBudget ? "expense" : usage.percent >= 80 ? "warning" : "income"} />

                {editingId === usage.budget.id ? (
                  <BudgetForm mode="edit" budget={usage.budget} defaultMonth={monthKey} />
                ) : null}
              </Card>
            ))}
          </ul>
        </>
      ) : null}

      {showCreate ? (
        <>
          <SectionTitle>Budget baru</SectionTitle>
          <BudgetForm mode="create" defaultMonth={monthKey} />
        </>
      ) : null}

      {unbudgeted.length > 0 ? (
        <Card as="section" className="flex flex-col gap-2">
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Pengeluaran tanpa budget</p>
          <ul className="flex flex-col gap-1.5">
            {unbudgeted.map((entry) => (
              <li key={entry.categoryId ?? "none"} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-ink">{categoryLabel(entry.categoryId)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular font-semibold text-ink">{formatIDR(entry.amount)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setEditingId(null);
                    }}
                    className="text-[11.5px] font-semibold text-brand hover:underline"
                  >
                    buatkan
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="px-1 text-[11.5px] leading-relaxed text-muted">
        Kategori yang tersedia: {EXPENSE_CATEGORIES.length} (Makanan, Transportasi, …). Budget lama tidak otomatis
        tersalin ke bulan baru — buat ulang lewat layar ini.
      </p>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Hapus budget ini?"
        description="Hanya batas anggarannya yang dihapus. Transaksi pengeluaran tetap utuh."
        confirmLabel="Hapus"
        onConfirm={() => {
          if (confirmDelete) void deleteBudget(confirmDelete);
          setConfirmDelete(null);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
