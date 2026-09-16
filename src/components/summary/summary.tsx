"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/domain/money";
import { ALL_CATEGORIES, type CategoryMeta } from "@/domain/categories";
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
        <ChevronLeft className="h-4 w-4" />
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
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TotalMoneyCard({
  total,
  walletTotal,
  savingsTotal,
  onboarding,
}: {
  total: number;
  walletTotal: number;
  savingsTotal: number;
  onboarding?: boolean;
}) {
  return (
    <Card as="section" className="border-transparent bg-[#173b3b] text-white">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-white/70">Total uang Anda</p>
      <p className="financial-display mt-1">{formatIDR(total)}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/80">
        <span>
          Dompet <strong className="tabular text-white">{formatIDR(walletTotal)}</strong>
        </span>
        <span>
          Tabungan <strong className="tabular text-white">{formatIDR(savingsTotal)}</strong>
        </span>
      </div>
      {onboarding ? (
        <p className="mt-3 rounded-lg bg-white/10 px-2.5 py-2 text-[12px] leading-relaxed text-white/85">
          Mulai dari satu dompet. Saldo tidak pernah diketik dua kali — semuanya dihitung dari transaksi.
        </p>
      ) : null}
    </Card>
  );
}

export function CashFlowCard({ summary }: { summary: MonthlySummary }) {
  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">Bulan ini</h2>
        <Badge tone={summary.netCashFlow >= 0 ? "income" : "expense"}>
          Net {formatIDR(summary.netCashFlow)}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure className={cn("rounded-xl px-3 py-2.5", "bg-income-soft")}>
          <figcaption className="text-[11.5px] font-semibold text-income">Pemasukan</figcaption>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-income">{formatIDR(summary.income)}</p>
          <p className="text-[11px] text-muted">{summary.incomeCount} transaksi</p>
        </figure>
        <figure className={cn("rounded-xl px-3 py-2.5", "bg-expense-soft")}>
          <figcaption className="text-[11.5px] font-semibold text-expense">Pengeluaran</figcaption>
          <p className="mt-0.5 text-[17px] font-extrabold tabular text-expense">{formatIDR(summary.expense)}</p>
          <p className="text-[11px] text-muted">{summary.expenseCount} transaksi</p>
        </figure>
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted">
        Transfer, setoran/penarikan tabungan, dan saldo awal tidak dihitung di sini — hanya pemasukan dan pengeluaran
        nyata.
      </p>
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
                className={cn("h-full", colorClass(entry.categoryId))}
                style={{ width: `${entry.percent}%` }}
              />
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-line/70">
            {entries.map((entry) => (
              <li key={entry.categoryId ?? "none"} className="flex items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorClass(entry.categoryId))} aria-hidden />
                  <span className="truncate text-[13.5px] font-semibold text-ink">
                    {labelFor(entry.categoryId)}
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

function labelFor(categoryId: string | null): string {
  if (!categoryId) return "Tanpa kategori";
  const meta = CATEGORY_LOOKUP.get(categoryId);
  return meta?.label ?? categoryId;
}

function colorClass(categoryId: string | null): string {
  const meta = CATEGORY_LOOKUP.get(categoryId ?? "");
  return CHART_CLASS.get(meta?.color ?? "slate") ?? "bg-slate-500";
}

const CATEGORY_LOOKUP = new Map<string, CategoryMeta>(ALL_CATEGORIES.map((category) => [category.id, category]));
const CHART_CLASS = new Map<string, string>(Object.entries(CHART_COLORS).map(([key, token]) => [key, token.bar]));
