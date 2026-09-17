"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowLeftRight, PiggyBank, Info, Plus } from "lucide-react";
import { Card, Badge, ProgressBar, LinkButton, EmptyState } from "@/components/ui/layout";
import { formatIDR } from "@/domain/money";
import { formatCompactIDR, type MoneyFlow, type TrendPoint } from "@/app/reports-derived";
import { categoryLabel, getCategoryIcon, getCategoryMeta } from "@/domain/categories";
import { colorFor } from "@/components/ui/theme";
import { cn } from "@/lib/cn";
import { formatMonthLabel } from "@/app/forms/month";
import type { CategoryBreakdownEntry, BudgetUsage } from "@/domain/selectors";
import type { Category } from "@/domain/models";

function renderCategoryIcon(categoryId: string | null | undefined, categories: Parameters<typeof getCategoryIcon>[1], className?: string) {
  const Icon = getCategoryIcon(categoryId, categories);
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

export function MonthlySummaryCard({
  income,
  expense,
  net,
  monthLabel,
}: {
  income: number;
  expense: number;
  net: number;
  monthLabel: string;
}) {
  const netTone = net >= 0 ? "income" : "expense";
  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Ringkasan {monthLabel}</p>
        <Badge tone={netTone === "income" ? "income" : "expense"}>Net {formatIDR(net)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-income-soft px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11.5px] font-semibold text-income">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            Pemasukan
          </p>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-income">{formatIDR(income)}</p>
        </div>
        <div className="rounded-xl bg-expense-soft px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11.5px] font-semibold text-expense">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Pengeluaran
          </p>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-expense">{formatIDR(expense)}</p>
        </div>
      </div>
      <div className="rounded-xl bg-elevated px-3 py-2.5 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-semibold text-muted">Arus bersih</p>
          <p className="text-[11px] text-muted">Pemasukan - Pengeluaran</p>
        </div>
        <p className={cn("text-[18px] font-extrabold tabular", netTone === "income" ? "text-income" : "text-expense")}>
          {formatIDR(net)}
        </p>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Transfer dan perpindahan tabungan tidak dihitung sebagai pemasukan atau pengeluaran.
      </p>
    </Card>
  );
}

export function ExpenseByCategoryCard({
  entries,
  monthKey,
  monthLabel,
  categories,
}: {
  entries: CategoryBreakdownEntry[];
  monthKey: string;
  monthLabel: string;
  categories: readonly Category[];
}) {
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  if (entries.length === 0) {
    return (
      <Card as="section" className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Pengeluaran per kategori</p>
        <p className="text-[13px] text-muted">Belum ada pengeluaran bulan ini.</p>
        <p className="text-[11.5px] text-muted">Pemasukan dan aktivitas lain tetap tercatat di ringkasan.</p>
      </Card>
    );
  }

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Pengeluaran per kategori</h2>
        <span className="text-[13px] font-bold tabular text-ink">{formatIDR(total)}</span>
      </div>

      {/* Compact visualization: proportion bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/70" aria-hidden>
        {entries.map((entry) => {
          const meta = getCategoryMeta(entry.categoryId, categories);
          const color = colorFor(meta?.color);
          return (
            <span
              key={entry.categoryId ?? "none"}
              className={cn("h-full", color.bar)}
              style={{ width: `${entry.percent}%` }}
              title={`${categoryLabel(entry.categoryId, "Tanpa kategori", categories)} ${formatIDR(entry.amount)}`}
            />
          );
        })}
      </div>

      <ul className="flex flex-col divide-y divide-line/70">
        {entries.map((entry) => {
          const meta = getCategoryMeta(entry.categoryId, categories);
          const color = colorFor(meta?.color);
          return (
            <li key={entry.categoryId ?? "none"} className="flex items-center justify-between gap-2 py-2.5">
              <Link
                href={`/transactions?month=${monthKey}&category=${entry.categoryId ?? ""}&type=expense`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg -mx-1 px-1 py-1 hover:bg-elevated transition"
                aria-label={`Lihat transaksi ${categoryLabel(entry.categoryId, "Tanpa kategori", categories)} bulan ${monthLabel}`}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    color.soft,
                    color.border,
                  )}
                >
                  {renderCategoryIcon(entry.categoryId, categories, cn("h-4 w-4", color.text))}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{categoryLabel(entry.categoryId, "Tanpa kategori", categories)}</span>
                  <span className="text-[11px] tabular text-muted">
                    {entry.percent.toFixed(0)}% · {entry.count} transaksi
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-[13.5px] font-bold tabular text-ink">{formatIDR(entry.amount)}</span>
                  <span className="text-[11px] tabular text-muted">{formatCompactIDR(entry.amount)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted">Diurutkan dari pengeluaran terbesar. Tekan kategori untuk melihat rincian transaksi.</p>
    </Card>
  );
}

export function SixMonthTrendCard({ trend, monthKey }: { trend: TrendPoint[]; monthKey: string }) {
  const max = Math.max(1, ...trend.map((p) => Math.max(p.income, p.expense)));
  const hasAny = trend.some((p) => p.income > 0 || p.expense > 0);

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Tren 6 bulan</h2>
        <span className="text-[11px] text-muted">Berakhir {formatMonthLabel(monthKey)}</span>
      </div>

      {!hasAny ? (
        <p className="text-[13px] text-muted">Belum ada pemasukan atau pengeluaran di 6 bulan terakhir.</p>
      ) : (
        <>
          {/* Visual trend only – exact values are shown in the list below to avoid label collision on 375/390/430.
              No compact numeric labels above bars, so Rp150rb/Rp115rb can never overlap. */}
          <ul className="flex items-end gap-2" role="list" aria-label="Grafik tren 6 bulan pemasukan dan pengeluaran">
            {trend.map((point) => {
              const isCurrent = point.monthKey === monthKey;
              const incomeH = Math.max(2, (point.income / max) * 100);
              const expenseH = Math.max(2, (point.expense / max) * 100);
              return (
                <li key={point.monthKey} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-20 w-full items-end justify-center gap-1">
                    <span
                      className={cn(
                        "w-full max-w-[14px] flex-1 rounded-t transition-colors",
                        point.income > 0 ? "bg-income" : "bg-income/20",
                      )}
                      style={{ height: `${incomeH}%`, minHeight: point.income > 0 ? "4px" : "2px" }}
                      role="img"
                      aria-label={`Pemasukan ${formatMonthLabel(point.monthKey)} ${formatIDR(point.income)}`}
                      title={`Pemasukan ${formatMonthLabel(point.monthKey)} ${formatIDR(point.income)}`}
                    />
                    <span
                      className={cn(
                        "w-full max-w-[14px] flex-1 rounded-t transition-colors",
                        point.expense > 0 ? "bg-expense" : "bg-expense/20",
                      )}
                      style={{ height: `${expenseH}%`, minHeight: point.expense > 0 ? "4px" : "2px" }}
                      role="img"
                      aria-label={`Pengeluaran ${formatMonthLabel(point.monthKey)} ${formatIDR(point.expense)}`}
                      title={`Pengeluaran ${formatMonthLabel(point.monthKey)} ${formatIDR(point.expense)}`}
                    />
                  </div>
                  <span className={cn("text-[10px] font-semibold leading-none", isCurrent ? "text-ink" : "text-muted")}>
                    {formatMonthLabel(point.monthKey).split(" ")[0]?.slice(0, 3)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-income" aria-hidden /> Pemasukan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-expense" aria-hidden /> Pengeluaran
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line/70 rounded-xl border border-line/60">
            {trend.map((point) => (
              <li key={point.monthKey} className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
                <span className={cn("font-semibold", point.monthKey === monthKey ? "text-ink" : "text-muted")}>
                  {formatMonthLabel(point.monthKey)}
                </span>
                <span className="flex items-center gap-2 tabular">
                  <span className="text-income">{formatIDR(point.income)}</span>
                  <span className="text-muted">/</span>
                  <span className="text-expense">{formatIDR(point.expense)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function BudgetVsActualCard({
  usages,
  monthKey,
  monthLabel,
  categories,
}: {
  usages: BudgetUsage[];
  monthKey: string;
  monthLabel: string;
  categories: readonly Category[];
}) {
  if (usages.length === 0) {
    return (
      <Card as="section" className="flex flex-col gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Budget vs Aktual</h2>
        <EmptyState
          title={`Belum ada budget untuk ${monthLabel}`}
          description="Buat budget per kategori untuk bulan ini agar pemakaian bisa dibandingkan dengan batas."
          action={
            <LinkButton href={`/budgets/new?month=${monthKey}`} size="md">
              <Plus className="h-4 w-4" aria-hidden />
              Buat budget
            </LinkButton>
          }
        />
      </Card>
    );
  }

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Budget vs Aktual</h2>
        <Link href={`/budgets?month=${monthKey}`} className="text-[12px] font-semibold text-brand hover:underline">
          Kelola budget
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {usages.map((usage) => {
          const meta = getCategoryMeta(usage.budget.categoryId, categories);
          const color = colorFor(meta?.color);
          const stateInfo = usage.overBudget
            ? { label: "MELEBIHI ANGGARAN", tone: "expense" as const, detail: `${formatIDR(usage.spent - usage.limit)} melebihi` }
            : usage.percent >= 80
              ? { label: "MENDEKATI BATAS", tone: "warning" as const, detail: `${formatIDR(usage.remaining)} tersisa` }
              : { label: "AMAN", tone: "income" as const, detail: `${formatIDR(usage.remaining)} tersisa` };

          return (
            <li key={usage.budget.id} className="flex flex-col gap-2 rounded-xl border border-line/60 bg-canvas p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", color.soft, color.border)}>
                    {renderCategoryIcon(usage.budget.categoryId, categories, cn("h-4 w-4", color.text))}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink">{categoryLabel(usage.budget.categoryId, "Tanpa kategori", categories)}</p>
                    <p className="text-[11px] tabular text-muted">
                      {formatIDR(usage.spent)} / {formatIDR(usage.limit)} · {usage.percent.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <Badge tone={stateInfo.tone}>{stateInfo.label}</Badge>
              </div>
              <ProgressBar percent={usage.percent} tone={stateInfo.tone} label={`Budget ${categoryLabel(usage.budget.categoryId, "Tanpa kategori", categories)}`} />
              <div className="flex items-center justify-between text-[11px]">
                <span className={cn(usage.overBudget ? "font-semibold text-expense" : "text-muted")}>{stateInfo.detail}</span>
                <span className="tabular font-semibold text-muted">{usage.percent.toFixed(0)}% aktual</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-muted">
        Persentase aktual tidak dibatasi 100%. Bar visual dibatasi 100% agar tetap terbaca saat melebihi anggaran.
      </p>
    </Card>
  );
}

export function MoneyFlowCard({ flow, monthLabel }: { flow: MoneyFlow; monthLabel: string }) {
  const hasAny =
    flow.income > 0 ||
    flow.expense > 0 ||
    flow.transfer > 0 ||
    flow.savingsDeposit > 0 ||
    flow.savingsWithdrawal > 0;

  if (!hasAny) {
    return (
      <Card as="section" className="flex flex-col gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Aktivitas uang</h2>
        <EmptyState
          title={`Belum ada aktivitas ${monthLabel}`}
          description="Catat transaksi untuk mulai melihat laporan keuangan bulan ini."
          action={
            <LinkButton href="/transactions/new" size="md">
              <Plus className="h-4 w-4" aria-hidden />
              Catat transaksi
            </LinkButton>
          }
        />
      </Card>
    );
  }

  return (
    <Card as="section" className="flex flex-col gap-3">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">Aktivitas uang</h2>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-income-soft px-3 py-2.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-income">
            <ArrowDown className="h-4 w-4" aria-hidden />
            Pemasukan
          </span>
          <span className="text-[14px] font-bold tabular text-income">{formatIDR(flow.income)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-expense-soft px-3 py-2.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-expense">
            <ArrowUp className="h-4 w-4" aria-hidden />
            Pengeluaran
          </span>
          <span className="text-[14px] font-bold tabular text-expense">{formatIDR(flow.expense)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-transfer-soft px-3 py-2.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-transfer">
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            Transfer antar dompet
          </span>
          <span className="text-[14px] font-bold tabular text-transfer">{formatIDR(flow.transfer)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-savings-soft px-3 py-2.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-savings">
            <PiggyBank className="h-4 w-4" aria-hidden />
            Masuk tabungan
          </span>
          <span className="text-[14px] font-bold tabular text-savings">{formatIDR(flow.savingsDeposit)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-savings-soft/60 px-3 py-2.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-savings">
            <PiggyBank className="h-4 w-4" aria-hidden />
            Keluar tabungan
          </span>
          <span className="text-[14px] font-bold tabular text-savings">{formatIDR(flow.savingsWithdrawal)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-elevated px-3 py-2.5">
        <div>
          <p className="text-[12px] font-bold text-ink">Arus kas bersih</p>
          <p className="text-[11px] text-muted">Pemasukan - Pengeluaran</p>
        </div>
        <p className={cn("text-[16px] font-extrabold tabular", flow.netCashFlow >= 0 ? "text-income" : "text-expense")}>
          {formatIDR(flow.netCashFlow)}
        </p>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Transfer dan perpindahan tabungan tidak dihitung sebagai pemasukan atau pengeluaran.
      </p>
    </Card>
  );
}
