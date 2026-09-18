"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Card, ICON_SIZE, ICON_STROKE } from "@/components/ui/layout";
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

/**
 * The Dashboard hero — total money as ONE financial overview.
 *
 * The amount is the dominant figure on Beranda; the derivation
 * (Dompet + Tabungan = Total) sits directly under it, and `children` renders the
 * current-month strip inside the same surface behind one internal hairline. The
 * two therefore read as a single overview instead of two unrelated cards.
 *
 * Everything here is derived input passed in — the component never computes a
 * balance — and every figure obeys the hide-balances preference.
 */
export function TotalMoneyCard({
  total,
  walletTotal,
  savingsTotal,
  children,
}: {
  total: number;
  walletTotal: number;
  savingsTotal: number;
  /** Current-month context rendered inside the hero (`MonthlySummaryStrip`). */
  children?: ReactNode;
}) {
  const hideBalances = useHideBalances();
  const updateSettings = useSmartSpendStore((state) => state.updateSettings);

  const EyeIcon = hideBalances ? EyeOff : Eye;
  const eyeLabel = hideBalances ? "Tampilkan nominal" : "Sembunyikan nominal";

  return (
    <section aria-labelledby="total-money-title" className="total-money-hero overflow-hidden rounded-surface border">
      <div className="px-4 pb-2.5 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="total-money-title"
            className="total-money-hero__eyebrow text-[11px] font-bold uppercase tracking-[0.08em]"
          >
            Total uang Anda
          </h2>
          <button
            type="button"
            aria-label={eyeLabel}
            aria-pressed={hideBalances}
            onClick={() => updateSettings({ hideBalances: !hideBalances })}
            className="motion-press -mr-1.5 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-[transform,color,background-color] duration-instant ease-standard hover:bg-surface/60 hover:text-primary-strong active:bg-surface/80"
          >
            <EyeIcon className={ICON_SIZE.md} aria-hidden strokeWidth={ICON_STROKE.ui} />
          </button>
        </div>

        <p
          className="financial-display total-money-hero__amount mt-0.5 break-words"
          aria-label={hideBalances ? "Jumlah total tersembunyi" : undefined}
        >
          {hideBalances ? maskMoney() : formatIDR(total)}
        </p>

        {/* Where the total comes from. Kept as separate nodes so each figure is
            its own text node (readable, and maskable one by one). */}
        <p className="total-money-hero__label mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px]">
          <span className="font-semibold">Dompet</span>
          <span className="total-money-hero__value tabular font-bold">
            {hideBalances ? maskMoney() : formatIDR(walletTotal)}
          </span>
          <span aria-hidden>·</span>
          <span className="font-semibold">Tabungan</span>
          <span className="total-money-hero__value tabular font-bold">
            {hideBalances ? maskMoney() : formatIDR(savingsTotal)}
          </span>
        </p>
      </div>

      {children ? <div className="total-money-hero__month border-t px-4 pb-3 pt-2.5">{children}</div> : null}
    </section>
  );
}

/**
 * This month as ONE compact data strip, rendered inside the hero (as
 * `TotalMoneyCard` children) so the month never becomes a second, unrelated card.
 *
 * The strip is deliberately reduced to what the Dashboard has to answer: label +
 * figure for income, expense and the difference. Per-type transaction counts were
 * dropped from the hero because they competed with the figures at phone density;
 * they remain on Reports and Budgets. The exclusion caveat is one short line of
 * secondary microcopy — no tooltip, no dialog.
 *
 * The figures come from `calculateMonthlySummary` untouched, so transfers,
 * savings movements and opening balances stay excluded. The difference carries an
 * explicit sign *and* a word ("surplus"/"defisit"/"seimbang"), so its meaning
 * never depends on colour alone.
 */
export function MonthlySummaryStrip({ summary, monthKey }: { summary: MonthlySummary; monthKey?: string }) {
  const hideBalances = useHideBalances();
  const net = summary.netCashFlow;
  const netTone = net > 0 ? "text-income" : net < 0 ? "text-expense" : "text-ink";
  const netWord = net > 0 ? "surplus" : net < 0 ? "defisit" : "seimbang";
  const money = (amount: number) => (hideBalances ? maskMoney() : formatIDR(amount));

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="total-money-hero__eyebrow text-[11px] font-bold uppercase tracking-[0.08em]">Bulan ini</h3>
        {monthKey ? (
          <p className="total-money-hero__label text-[11.5px] font-semibold">{formatMonthLabel(monthKey)}</p>
        ) : null}
      </div>

      <dl className="mt-1.5 grid grid-cols-3 gap-x-3">
        <div className="min-w-0">
          <dt className="total-money-hero__label metadata">Pemasukan</dt>
          <dd className="mt-0.5 break-words text-[13px] font-extrabold tabular tracking-[-0.01em] text-income">
            {money(summary.income)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="total-money-hero__label metadata">Pengeluaran</dt>
          <dd className="mt-0.5 break-words text-[13px] font-extrabold tabular tracking-[-0.01em] text-expense">
            {money(summary.expense)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="total-money-hero__label metadata">Selisih</dt>
          <dd className={cn("mt-0.5 break-words text-[13px] font-extrabold tabular tracking-[-0.01em]", netTone)}>
            {hideBalances ? maskMoney() : signedNet(net)}
          </dd>
        </div>
      </dl>

      {/* Two short secondary lines instead of one long sentence: the first states
          what the figures exclude, the second writes the net meaning out — so the
          sign and the tone never carry it alone. Both stay on one line at 375px. */}
      <p className="total-money-hero__label mt-1.5 text-[11px] leading-snug">
        Transfer, tabungan &amp; saldo awal tidak dihitung.
      </p>
      <p className="total-money-hero__label mt-0.5 text-[11px] leading-snug">Selisih bulan ini: {netWord}.</p>
    </>
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
