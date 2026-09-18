"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, Info } from "lucide-react";
import { Card } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/domain/money";
import { type CategoryMeta } from "@/domain/categories";
import { useSmartSpendStore } from "@/app/store";
import { maskMoney, useHideBalances } from "@/components/settings/money-mask";
import { CHART_COLORS } from "@/components/ui/theme";
import { formatMonthLabel, monthInputValueFor, shiftMonthKey } from "@/app/forms/month";
import type { MonthlySummary } from "@/domain/selectors";

/** Month stepper used by Dashboard / Budgets / Reports. */
export function MonthPicker({
  monthKey,
  onChange,
  allowFuture = false,
}: {
  monthKey: string;
  onChange: (monthKey: string) => void;
  allowFuture?: boolean;
}) {
  const current = monthInputValueFor();
  const atCurrent = monthKey === current;
  const nextDisabled = !allowFuture && atCurrent;

  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface px-1 py-1">
      <button
        type="button"
        aria-label="Bulan sebelumnya"
        onClick={() => onChange(shiftMonthKey(monthKey, -1))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[13px] font-bold text-ink">
        <CalendarDays className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span className="truncate">{formatMonthLabel(monthKey)}</span>
      </span>
      <button
        type="button"
        aria-label="Bulan berikutnya"
        disabled={nextDisabled}
        onClick={() => onChange(shiftMonthKey(monthKey, 1))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function TotalMoneyCard({
  total,
  walletTotal,
  savingsTotal,
}: {
  total: number;
  walletTotal: number;
  savingsTotal: number;
}) {
  const hideBalances = useHideBalances();
  const updateSettings = useSmartSpendStore((state) => state.updateSettings);

  const EyeIcon = hideBalances ? EyeOff : Eye;
  const eyeLabel = hideBalances ? "Tampilkan nominal" : "Sembunyikan nominal";

  return (
    <section className="total-money-hero overflow-hidden rounded-xl border">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="total-money-hero__eyebrow text-[11px] font-bold uppercase tracking-[0.08em]">Total uang Anda</p>
          <button
            type="button"
            aria-label={eyeLabel}
            onClick={() => updateSettings({ hideBalances: !hideBalances })}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface/60 text-muted transition hover:border-brand/40 hover:text-brand"
          >
            <EyeIcon className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        <p
          className="financial-display total-money-hero__amount mt-1 text-[2rem]"
          aria-label={hideBalances ? "Jumlah total tersembunyi" : undefined}
        >
          {hideBalances ? maskMoney() : formatIDR(total)}
        </p>
      </div>
      <div className="total-money-hero__breakdown grid grid-cols-2 border-t">
        <div className="px-4 py-2.5">
          <p className="total-money-hero__label text-[11px] font-semibold">Dompet</p>
          <p className="total-money-hero__value mt-0.5 text-[13.5px] font-bold tabular">
            {hideBalances ? maskMoney() : formatIDR(walletTotal)}
          </p>
        </div>
        <div className="total-money-hero__split border-l px-4 py-2.5">
          <p className="total-money-hero__label text-[11px] font-semibold">Tabungan</p>
          <p className="total-money-hero__value mt-0.5 text-[13.5px] font-bold tabular">
            {hideBalances ? maskMoney() : formatIDR(savingsTotal)}
          </p>
        </div>
      </div>
    </section>
  );
}

export function CashFlowCard({ summary }: { summary: MonthlySummary }) {
  const hideBalances = useHideBalances();
  const netTone = summary.netCashFlow >= 0 ? "text-income" : "text-expense";

  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">Bulan ini</h2>
        <p className={cn("text-[14px] font-extrabold tabular", netTone)}>
          {hideBalances ? maskMoney() : `Net ${formatIDR(summary.netCashFlow)}`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure className="rounded-lg bg-income-soft px-3 py-2.5">
          <figcaption className="flex items-center gap-1.5 text-[11.5px] font-semibold text-income">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            Pemasukan
          </figcaption>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-income">
            {hideBalances ? maskMoney() : formatIDR(summary.income)}
          </p>
          <p className="text-[11px] text-muted">{summary.incomeCount} transaksi</p>
        </figure>
        <figure className="rounded-lg bg-expense-soft px-3 py-2.5">
          <figcaption className="flex items-center gap-1.5 text-[11.5px] font-semibold text-expense">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Pengeluaran
          </figcaption>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-expense">
            {hideBalances ? maskMoney() : formatIDR(summary.expense)}
          </p>
          <p className="text-[11px] text-muted">{summary.expenseCount} transaksi</p>
        </figure>
      </div>
      <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Hanya pemasukan dan pengeluaran nyata; transfer, tabungan, dan saldo awal dikecualikan.
      </p>
      <Link
        href="/reports"
        className="flex items-center gap-0.5 self-start text-[12px] font-semibold text-brand hover:underline"
      >
        Lihat laporan
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </Card>
  );
}

/**
 * Category breakdown as a proportion bar + ranked list.
 * (Animated/interactive charts are Phase 2; the numbers are final already.)
 */
export function BreakdownList({
  title,
  entries,
  emptyLabel = "Belum ada data pada periode ini.",
  linkPrefix,
}: {
  title: string;
  entries: { categoryId: string | null; amount: number; percent: number; count: number }[];
  emptyLabel?: string;
  linkPrefix?: string;
}) {
  const categories = useSmartSpendStore((state) => state.data.categories);
  const categoryLookup = useMemo(() => new Map<string, CategoryMeta>(categories.map((category) => [category.id, category])), [categories]);
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">{title}</h2>
        <span className="text-[13px] font-bold tabular text-ink">{formatIDR(total)}</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-[13px] text-muted">{emptyLabel}</p>
      ) : (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/70" aria-hidden>
            {entries.map((entry) => (
              <span
                key={entry.categoryId ?? "none"}
                className={cn("h-full", colorClass(entry.categoryId, categoryLookup))}
                style={{ width: `${entry.percent}%` }}
              />
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-line/70">
            {entries.map((entry) => (
              <li key={entry.categoryId ?? "none"} className="flex items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorClass(entry.categoryId, categoryLookup))} aria-hidden />
                  <span className="truncate text-[13.5px] font-semibold text-ink">
                    {labelFor(entry.categoryId, categoryLookup)}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{entry.count}×</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-[11px] tabular text-muted">{entry.percent.toFixed(0)}%</span>
                  <span className="text-[13.5px] font-bold tabular text-ink">{formatIDR(entry.amount)}</span>
                  {linkPrefix && entry.categoryId ? (
                    <Link
                      href={`${linkPrefix}?category=${entry.categoryId}`}
                      className="text-[11px] font-semibold text-brand hover:underline"
                    >
                      lihat
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function labelFor(categoryId: string | null, categoryLookup: Map<string, CategoryMeta>): string {
  if (!categoryId) return "Tanpa kategori";
  const meta = categoryLookup.get(categoryId);
  return meta?.label ?? categoryId;
}

function colorClass(categoryId: string | null, categoryLookup: Map<string, CategoryMeta>): string {
  const meta = categoryLookup.get(categoryId ?? "");
  return CHART_CLASS.get(meta?.color ?? "slate") ?? "bg-slate-500";
}

const CHART_CLASS = new Map<string, string>(Object.entries(CHART_COLORS).map(([key, token]) => [key, token.bar]));
