"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, ProgressBar, SectionTitle } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { formatMonthLabel } from "@/app/forms/month";
import { MonthPicker } from "@/components/summary/summary";
import { BudgetForm } from "@/app/forms/budget-form";
import { useSmartSpendStore } from "@/app/store";
import { categoryLabel, getCategoryIcon, getCategoryMeta } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import { calculateBudgetUsage, calculateCategoryBreakdown, currentMonthKey } from "@/domain/selectors";
import { colorFor } from "@/components/ui/theme";
import { readQueryParam } from "@/lib/route-params";
import { isMonthKey } from "@/domain/calendar";
import { cn } from "@/lib/cn";
import type { Budget } from "@/domain/models";

function renderCategoryIcon(categoryId: string | null | undefined, categories: Parameters<typeof getCategoryIcon>[1], className?: string) {
  const Icon = getCategoryIcon(categoryId, categories);
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

export default function BudgetsPage() {
  return (
    <HydrationGate>
      <BudgetsContent />
    </HydrationGate>
  );
}

function BudgetsContent() {
  const monthParam = readQueryParam("month");
  const [monthKey, setMonthKey] = useState(isMonthKey(monthParam) ? monthParam : currentMonthKey());
  const data = useSmartSpendStore((state) => state.data);
  const deleteBudget = useSmartSpendStore((state) => state.deleteBudget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Budget | null>(null);

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
      <PageHeader
        title="Budget"
        subtitle="Satu batas per kategori per bulan, dihitung dari pengeluaran nyata saja."
        backHref="/more"
        actions={
          editingId === null ? (
            <LinkButton href={`/budgets/new?month=${monthKey}`} size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              Anggaran
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3">
        <MonthPicker monthKey={monthKey} onChange={(next) => setMonthKey(next)} allowFuture />

        {budgets.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-7 w-7" />}
            title={`Belum ada budget untuk ${formatMonthLabel(monthKey)}`}
            description="Tentukan batas per kategori; pemakaian akan dihitung otomatis dari pengeluaran (tanpa menghitung transfer & setoran tabungan)."
            action={
              <LinkButton href={`/budgets/new?month=${monthKey}`} size="md">
                <Plus className="h-4 w-4" aria-hidden />
                Buat budget
              </LinkButton>
            }
          />
        ) : (
          <>
            <Card as="section" className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                    Total anggaran {formatMonthLabel(monthKey)}
                  </p>
                  <p className="text-[24px] font-extrabold tabular text-ink">
                    {formatIDR(totalLimit)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    tone={
                      totalSpent > totalLimit
                        ? "expense"
                        : totalLimit > 0 && totalSpent >= 0.8 * totalLimit
                          ? "warning"
                          : "brand"
                    }
                  >
                    {totalLimit > 0 ? `${((totalSpent / totalLimit) * 100).toFixed(0)}%` : "—"}
                  </Badge>
                  <span className="text-[11.5px] text-muted">{budgets.length} kategori</span>
                </div>
              </div>

              <ProgressBar
                percent={totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0}
                tone={
                  totalSpent > totalLimit
                    ? "expense"
                    : totalLimit > 0 && totalSpent >= 0.8 * totalLimit
                      ? "warning"
                      : "brand"
                }
                label={`Total anggaran ${formatMonthLabel(monthKey)}`}
              />

              <div className="grid grid-cols-2 gap-3 border-t border-line/60 pt-2.5">
                <div>
                  <p className="text-[11.5px] font-medium text-muted">Terpakai</p>
                  <p className="mt-0.5 text-[15px] font-bold tabular text-ink">{formatIDR(totalSpent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11.5px] font-medium text-muted">
                    {totalSpent > totalLimit ? "Melebihi anggaran" : "Sisa anggaran"}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[15px] font-bold tabular",
                      totalSpent > totalLimit ? "text-expense" : "text-income",
                    )}
                  >
                    {totalSpent > totalLimit
                      ? `+${formatIDR(totalSpent - totalLimit)}`
                      : formatIDR(totalLimit - totalSpent)}
                  </p>
                </div>
              </div>
            </Card>

            <SectionTitle
              action={
                editingId === null ? (
                  <LinkButton href={`/budgets/new?month=${monthKey}`} size="sm" variant="soft">
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Anggaran
                  </LinkButton>
                ) : undefined
              }
            >
              Per kategori
            </SectionTitle>

            <ul className="flex flex-col gap-2">
              {usages.map((usage) => {
                const meta = getCategoryMeta(usage.budget.categoryId, data.categories);
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

                return (
                  <Card as="li" key={usage.budget.id} className="flex flex-col gap-2.5 !p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                            color.soft,
                            color.border,
                          )}
                        >
                          {renderCategoryIcon(usage.budget.categoryId, data.categories, cn("h-4 w-4", color.text))}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-bold text-ink">
                            {categoryLabel(usage.budget.categoryId, "Tanpa kategori", data.categories)}
                          </p>
                          <p className="text-[12px] tabular text-muted">
                            Terpakai {formatIDR(usage.spent)} dari {formatIDR(usage.limit)}
                          </p>
                        </div>
                      </div>
                      <Badge tone={stateInfo.tone}>{stateInfo.state}</Badge>
                    </div>

                    <ProgressBar
                      percent={usage.percent}
                      tone={stateInfo.tone}
                      label={`Budget ${categoryLabel(usage.budget.categoryId, "Tanpa kategori", data.categories)}`}
                    />

                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span
                        className={cn(
                          "font-medium",
                          usage.overBudget ? "font-semibold text-expense" : "text-muted",
                        )}
                      >
                        {stateInfo.detail}
                      </span>
                      <span className="tabular font-semibold text-muted">{usage.percent.toFixed(0)}%</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-line/60 pt-2">
                      <Link
                        href={`/budgets/${usage.budget.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                      >
                        Detail & riwayat
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-[12px]"
                          onClick={() => setEditingId(editingId === usage.budget.id ? null : usage.budget.id)}
                          aria-label={`Ubah budget ${categoryLabel(usage.budget.categoryId, "Tanpa kategori", data.categories)}`}
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                          {editingId === usage.budget.id ? "Tutup" : "Ubah"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2.5 text-[12px] text-muted hover:text-expense"
                          onClick={() => setConfirmDelete(usage.budget)}
                          aria-label={`Hapus budget ${categoryLabel(usage.budget.categoryId, "Tanpa kategori", data.categories)}`}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                          Hapus
                        </Button>
                      </div>
                    </div>

                    {editingId === usage.budget.id ? (
                      <div className="mt-2 border-t border-line/60 pt-2">
                        <BudgetForm
                          mode="edit"
                          budget={usage.budget}
                          defaultMonth={monthKey}
                          actionsMode="inline"
                          wrapCard={false}
                          onCancel={() => setEditingId(null)}
                          onSuccess={() => setEditingId(null)}
                        />
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </ul>
          </>
        )}

        {unbudgeted.length > 0 ? (
          <Card as="section" className="flex flex-col gap-2">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Pengeluaran tanpa budget</p>
            <ul className="flex flex-col gap-1.5">
              {unbudgeted.map((entry) => (
                <li key={entry.categoryId ?? "none"} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink">{categoryLabel(entry.categoryId, "Tanpa kategori", data.categories)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-semibold text-ink">{formatIDR(entry.amount)}</span>
                    <Link
                      href={`/budgets/new?category=${entry.categoryId}&month=${monthKey}`}
                      className="text-[11.5px] font-semibold text-brand hover:underline"
                    >
                      + budget
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <p className="px-1 text-[11.5px] leading-relaxed text-muted">
          Kategori yang tersedia: {data.categories.filter((category) => category.type === "expense" && category.archivedAt == null).length} (Makanan, Transportasi, …). Budget lama tidak otomatis
          tersalin ke bulan baru — buat ulang lewat layar ini.
        </p>

        <ConfirmDialog
          open={confirmDelete !== null}
          title={`Hapus budget ${confirmDelete ? categoryLabel(confirmDelete.categoryId, "Tanpa kategori", data.categories) : ""}?`}
          description="Hanya batas anggarannya yang dihapus. Seluruh transaksi pengeluaran tetap utuh di catatan keuangan."
          confirmLabel="Hapus"
          onConfirm={() => {
            if (confirmDelete) void deleteBudget(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      </div>
    </>
  );
}
