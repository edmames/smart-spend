"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, ProgressBar, SectionTitle, Badge } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { BreakdownList, MonthPicker } from "@/components/summary/summary";
import { clampMonth, currentMonthKey, formatMonthLabel } from "@/app/forms/month";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import {
  calculateBudgetUsage,
  calculateCategoryBreakdown,
  calculateMonthlySummary,
  shiftMonthKey,
} from "@/domain/selectors";
import { cn } from "@/lib/cn";
import { calculateSavingsBalance } from "@/domain/ledger";
import { categoryLabel } from "@/domain/categories";

/**
 * `/reports` — Phase 1 keeps this numeric and honest: real aggregates from the
 * domain, one proportion bar per breakdown. Animated/interactive charts are
 * Phase 2 work; the underlying numbers will not change.
 */
export default function ReportsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  return (
    <>
      <PageHeader title="Laporan" subtitle="Semua angka diturunkan langsung dari ledger." backHref="/more" />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          <ReportsBody monthKey={monthKey} onChangeMonth={setMonthKey} />
        </HydrationGate>
      </div>
    </>
  );
}

function ReportsBody({ monthKey, onChangeMonth }: { monthKey: string; onChangeMonth: (key: string) => void }) {
  const data = useSmartSpendStore((state) => state.data);

  if (data.transactions.length === 0) {
    return (
      <EmptyState
        title="Belum ada yang bisa dilaporkan"
        description="Laporan dihitung dari transaksi. Catat beberapa transaksi, lalu buka halaman ini lagi."
      />
    );
  }

  const summary = calculateMonthlySummary(data.transactions, monthKey);
  const breakdown = calculateCategoryBreakdown(data.transactions, { type: "expense", monthKey });
  const incomeBreakdown = calculateCategoryBreakdown(data.transactions, { type: "income", monthKey });
  const budgets = data.budgets
    .filter((budget) => budget.month === monthKey)
    .map((budget) => calculateBudgetUsage(budget, data.transactions, monthKey));

  const trendKeys: string[] = [];
  for (let i = 5; i >= 0; i -= 1) trendKeys.push(shiftMonthKey(monthKey, -i));
  const trend = trendKeys.map((key) => calculateMonthlySummary(data.transactions, key));
  const trendMax = Math.max(1, ...trend.map((point) => Math.max(point.income, point.expense)));

  return (
    <>
      <MonthPicker monthKey={monthKey} onChange={(next) => onChangeMonth(clampMonth(next))} />

      <Card as="section" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Ringkasan {formatMonthLabel(monthKey)}</p>
          <Badge tone={summary.netCashFlow >= 0 ? "income" : "expense"}>
            Net {formatIDR(summary.netCashFlow)}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-income-soft px-3 py-2">
            <p className="text-[11.5px] font-semibold text-income">Pemasukan</p>
            <p className="text-[17px] font-extrabold tabular text-income">{formatIDR(summary.income)}</p>
          </div>
          <div className="rounded-xl bg-expense-soft px-3 py-2">
            <p className="text-[11.5px] font-semibold text-expense">Pengeluaran</p>
            <p className="text-[17px] font-extrabold tabular text-expense">{formatIDR(summary.expense)}</p>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted">
          Hanya tipe <strong>income</strong> yang masuk pemasukan dan hanya <strong>expense</strong> yang masuk
          pengeluaran. Transfer, setoran/penarikan tabungan, dan saldo awal dikecualikan.
        </p>
      </Card>

      <Card as="section" className="flex flex-col gap-3">
        <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Tren 6 bulan</p>
        <ul className="flex items-end gap-1.5">
          {trend.map((point) => (
            <li key={point.monthKey} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <span
                  className="w-1/2 rounded-t bg-income/85"
                  style={{ height: `${Math.max(2, (point.income / trendMax) * 100)}%` }}
                  title={`Pemasukan ${formatIDR(point.income)}`}
                />
                <span
                  className="w-1/2 rounded-t bg-expense/85"
                  style={{ height: `${Math.max(2, (point.expense / trendMax) * 100)}%` }}
                  title={`Pengeluaran ${formatIDR(point.expense)}`}
                />
              </div>
              <span className={cn("text-[10px] font-semibold", point.monthKey === monthKey ? "text-ink" : "text-muted")}>
                {formatMonthLabel(point.monthKey).split(" ")[0]?.slice(0, 3)}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-income" aria-hidden /> pemasukan
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-expense" aria-hidden /> pengeluaran
          </span>
        </p>
      </Card>

      <BreakdownList
        title={`Pengeluaran ${formatMonthLabel(monthKey)}`}
        entries={breakdown}
        emptyLabel="Tidak ada pengeluaran pada bulan ini."
        linkPrefix="/transactions"
      />

      <BreakdownList
        title={`Pemasukan ${formatMonthLabel(monthKey)}`}
        entries={incomeBreakdown}
        emptyLabel="Tidak ada pemasukan pada bulan ini."
      />

      {budgets.length > 0 ? (
        <Card as="section" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Budget terpakai</p>
            <Link href="/budgets" className="text-[12px] font-semibold text-brand hover:underline">
              kelola
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {budgets.map((usage) => (
              <li key={usage.budget.id} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-semibold text-ink">{categoryLabel(usage.budget.categoryId)}</span>
                  <span className="shrink-0 tabular text-muted">
                    {formatIDR(usage.spent)} / {formatIDR(usage.limit)}
                  </span>
                </span>
                <ProgressBar percent={usage.percent} tone={usage.overBudget ? "expense" : "income"} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <SectionTitle>Tabungan</SectionTitle>
      <Card as="section" className="flex flex-col gap-2">
        {data.savingsTargets.length === 0 ? (
          <p className="text-[13px] text-muted">
            Belum ada target tabungan.{" "}
            <Link href="/savings/new" className="font-semibold text-brand hover:underline">
              Buat target
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/70">
            {data.savingsTargets.map((target) => {
              const saved = calculateSavingsBalance(data.transactions, target.id);
              return (
                <li key={target.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/savings/${target.id}`} className="min-w-0 truncate text-[13.5px] font-semibold text-ink hover:underline">
                    {target.name}
                  </Link>
                  <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{formatIDR(saved)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Catatan Phase 1: laporan ini belum punya grafik interaktif atau ekspor PDF — strukturnya sudah memakai
        fungsi domain yang sama, jadi Phase 2 hanya menambah tampilan.
      </p>
    </>
  );
}
