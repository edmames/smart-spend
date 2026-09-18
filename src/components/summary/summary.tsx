"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, Info } from "lucide-react";
import { Card, ICON_SIZE, ICON_STROKE, SectionTitle } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { formatIDR, formatSignedIDR } from "@/domain/money";
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
    <section aria-labelledby="total-money-title" className="total-money-hero overflow-hidden rounded-surface border">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="total-money-title"
              className="total-money-hero__eyebrow text-[11px] font-bold uppercase tracking-[0.08em]"
            >
              Total uang Anda
            </h2>
            <p className="total-money-hero__label metadata mt-0.5">Dompet + tabungan</p>
          </div>
          <button
            type="button"
            aria-label={eyeLabel}
            aria-pressed={hideBalances}
            onClick={() => updateSettings({ hideBalances: !hideBalances })}
            className="motion-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface/60 text-muted transition-[transform,color,background-color,border-color] duration-instant ease-standard hover:border-primary/45 hover:text-primary active:bg-elevated"
          >
            <EyeIcon className={ICON_SIZE.md} aria-hidden strokeWidth={ICON_STROKE.ui} />
          </button>
        </div>
        <p
          className="financial-display total-money-hero__amount mt-1.5 break-words text-[2rem]"
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

/**
 * This month as ONE compact data strip: income, expense and the difference
 * between them (never three separate cards, and never a colourful pair of tiles
 * that reads as two more surfaces).
 *
 * The figures come from `calculateMonthlySummary` untouched, so transfers,
 * savings movements and opening balances stay excluded. The net carries an
 * explicit sign and a word, so its meaning never depends on colour alone.
 */
export function CashFlowCard({ summary, monthKey }: { summary: MonthlySummary; monthKey?: string }) {
  const hideBalances = useHideBalances();
  const net = summary.netCashFlow;
  const netTone = net > 0 ? "text-income" : net < 0 ? "text-expense" : "text-ink";
  const netWord = net > 0 ? "surplus" : net < 0 ? "defisit" : "seimbang";
  const money = (amount: number) => (hideBalances ? maskMoney() : formatIDR(amount));

  return (
    <section aria-labelledby="month-summary-title" className="flex flex-col gap-2">
      <SectionTitle id="month-summary-title">
        Bulan ini
        {monthKey ? <span className="font-normal text-subtle"> · {formatMonthLabel(monthKey)}</span> : null}
      </SectionTitle>

      <Card padded={false} className="overflow-hidden">
        <dl className="grid grid-cols-3 divide-x divide-line">
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2.5">
            <dt className="metadata font-semibold">Pemasukan</dt>
            <dd className="break-words text-[14px] font-extrabold tabular text-income">{money(summary.income)}</dd>
            <dd className="metadata">{summary.incomeCount} transaksi</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2.5">
            <dt className="metadata font-semibold">Pengeluaran</dt>
            <dd className="break-words text-[14px] font-extrabold tabular text-expense">{money(summary.expense)}</dd>
            <dd className="metadata">{summary.expenseCount} transaksi</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2.5">
            <dt className="metadata font-semibold">Selisih</dt>
            <dd className={cn("break-words text-[14px] font-extrabold tabular", netTone)}>
              {hideBalances ? maskMoney() : signedNet(net)}
            </dd>
            <dd className="metadata">{netWord}</dd>
          </div>
        </dl>
      </Card>

      <p className="flex items-start gap-1.5 px-0.5 text-[11.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Hanya pemasukan dan pengeluaran nyata; transfer, tabungan, dan saldo awal dikecualikan.
      </p>
    </section>
  );
}

/** Net cash flow keeps an explicit sign so it never relies on colour to be read. */
function signedNet(value: number): string {
  if (value > 0) return formatSignedIDR(value, "income");
  if (value < 0) return formatSignedIDR(value, "expense");
  return formatSignedIDR(0, "neutral");
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
