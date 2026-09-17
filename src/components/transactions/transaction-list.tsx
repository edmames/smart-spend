"use client";

import { formatCalendarDate } from "@/domain/calendar";

import { useMemo, useState } from "react";
import { Filter, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { formatIDR } from "@/domain/money";
import { Badge, Button, Card, EmptyState } from "@/components/ui/layout";
import { ChipToggle } from "@/components/ui/forms";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { cn } from "@/lib/cn";
import { ALL_CATEGORIES, TRANSACTION_TYPE_LABELS, type TransactionType } from "@/domain/categories";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/domain/models";
import { filterTransactions, rangeForPeriod } from "@/domain/selectors";
import type { Transaction } from "@/domain/models";
import { useSmartSpendStore } from "@/app/store";
import { useDerived } from "@/app/derived";
import { EMPTY_FILTER, type TransactionFilterState, type PeriodPreset } from "@/types";

/**
 * The reusable ledger list: search + filter (type / category / wallet / payment
 * method / period) over the same sorted ledger everywhere it appears, so a wallet
 * page, the transaction page and the savings page can never disagree.
 */
export interface TransactionListPageProps {
  title: string;
  filter: TransactionFilterState;
  onFilterChange: (next: TransactionFilterState) => void;
  walletIds?: readonly string[];
  savingsTargetIds?: readonly string[];
  emptyTitle?: string;
  emptyDescription?: string;
  action?: React.ReactNode;
  dense?: boolean;
}

export function useFilteredTransactions(
  filter: TransactionFilterState,
  scopes: { walletIds?: readonly string[]; savingsTargetIds?: readonly string[] } = {},
) {
  const data = useSmartSpendStore((state) => state.data);
  const derived = useDerived();

  return useMemo(() => {
    const from = filter.period === "custom" ? filter.customFrom : undefined;
    const to = filter.period === "custom" ? filter.customTo : undefined;
    const period =
      filter.period === "thisMonth" || filter.period === "lastMonth" ? filter.period : undefined;
    const range = period ? rangeForPeriod(period) : undefined;

    let items = filterTransactions(
      data.transactions,
      {
        query: filter.query,
        types: filter.types.length > 0 ? (filter.types as TransactionType[]) : undefined,
        categoryIds: filter.categoryIds.length > 0 ? filter.categoryIds : undefined,
        walletIds: filter.walletIds.length > 0 ? filter.walletIds : scopes.walletIds,
        paymentMethods: filter.paymentMethods.length > 0 ? filter.paymentMethods : undefined,
        from: range ? range.from : from,
        to: range ? range.to : to,
      },
      { walletNames: derived.walletNameById, categoryLabels: categoryLabelMap() },
    );

    if (scopes.savingsTargetIds?.length) {
      const targets = new Set(scopes.savingsTargetIds);
      items = items.filter((transaction) => transaction.savingsTargetId && targets.has(transaction.savingsTargetId));
    }

    return items.reverse();
  }, [data.transactions, filter, scopes.walletIds, scopes.savingsTargetIds, derived.walletNameById]);
}

function categoryLabelMap(): Map<string, string> {
  return new Map(ALL_CATEGORIES.map((category) => [category.id, category.label]));
}

export function countActiveFilters(filter: TransactionFilterState): number {
  return (
    (filter.types.length > 0 ? 1 : 0) +
    (filter.categoryIds.length > 0 ? 1 : 0) +
    (filter.walletIds.length > 0 ? 1 : 0) +
    (filter.paymentMethods.length > 0 ? 1 : 0) +
    (filter.period !== "all" ? 1 : 0)
  );
}

export function TransactionList({
  items,
  emptyTitle = "Belum ada transaksi",
  emptyDescription = "Catat pemasukan, pengeluaran, atau transfer pertama Anda.",
  dense,
  action,
}: {
  items: ReturnType<typeof useFilteredTransactions>;
  emptyTitle?: string;
  emptyDescription?: string;
  dense?: boolean;
  action?: React.ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={action} />;
  }

  const groups = groupByDayPreservingOrder(items);
  const totalIn = items.reduce((sum, item) => (item.type === "income" ? sum + item.amount : sum), 0);
  const totalOut = items.reduce((sum, item) => (item.type === "expense" ? sum + item.amount : sum), 0);

  return (
    <div className={cn("flex flex-col gap-3", dense && "gap-2")}>
      <div className="grid grid-cols-3 gap-1.5">
        <ListStat label="Catatan" value={`${items.length}`} />
        <ListStat label="Masuk" value={formatIDR(totalIn)} tone="income" />
        <ListStat label="Keluar" value={formatIDR(totalOut)} tone="expense" />
      </div>
      {groups.map((group) => (
        <section key={group.key} aria-label={`Transaksi ${group.label}`}>
          <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-muted">{group.label}</h3>
            <span className="text-[11.5px] tabular text-muted">{formatIDR(group.total)}</span>
          </div>
          <Card as="section" padded={false} className="overflow-hidden px-1.5 py-1">
            <ul className="flex flex-col">
              {group.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  href={`/transactions/${transaction.id}`}
                />
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

function ListStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-[12px] font-bold tabular text-ink",
          tone === "income" && "text-income",
          tone === "expense" && "text-expense",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function groupByDayPreservingOrder(
  items: Transaction[],
): { key: string; label: string; total: number; items: Transaction[] }[] {
  const groups: { key: string; label: string; total: number; items: Transaction[] }[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = item.date;
    let position = index.get(key);
    if (position === undefined) {
      position = groups.length;
      index.set(key, position);
      groups.push({
        key,
        label: formatCalendarDate(item.date),
        total: 0,
        items: [],
      });
    }
    const group = groups[position];
    if (!group) continue;
    group.items.push(item);
    if (item.type === "income" || item.type === "expense") group.total += item.amount;
  }
  return groups;
}

export function TransactionFilterPanel({
  filter,
  onChange,
  walletOptions,
  onReset,
}: {
  filter: TransactionFilterState;
  onChange: (next: TransactionFilterState) => void;
  walletOptions: { value: string; label: string }[];
  /** Lets the host screen clear deep-link params that live in the URL. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filter);
  const clearAll = () => {
    onChange(EMPTY_FILTER);
    onReset?.();
  };

  type MultiKey = "types" | "categoryIds" | "walletIds" | "paymentMethods";

  const toggle = (key: MultiKey, value: string) => {
    const current: string[] = filter[key];
    const next: string[] = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    onChange({ ...filter, [key]: next } as TransactionFilterState);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={filter.query}
            onChange={(event) => onChange({ ...filter, query: event.target.value })}
            placeholder="Cari catatan, kategori, dompet…"
            aria-label="Cari transaksi"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-8 pr-8 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {filter.query ? (
            <button
              type="button"
              onClick={() => onChange({ ...filter, query: "" })}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <Button
          variant={open || active > 0 ? "soft" : "secondary"}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <Filter className="h-4 w-4" aria-hidden />
          <span>Filter</span>
          {active > 0 ? (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-primary-foreground">
              {active}
            </span>
          ) : null}
        </Button>
      </div>

      {open ? (
        <Card as="section" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Saring transaksi
            </h3>
            {active > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex min-h-8 items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset filter
              </button>
            ) : null}
          </div>

          <ChipToggle<string>
            label="Periode"
            options={[
              { value: "all", label: "Semua" },
              { value: "thisMonth", label: "Bulan ini" },
              { value: "lastMonth", label: "Bulan lalu" },
              { value: "custom", label: "Custom" },
            ]}
            selected={[filter.period]}
            onToggle={(value) => onChange({ ...filter, period: value as PeriodPreset })}
          />

          {filter.period === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
                Dari
                <input
                  type="date"
                  value={filter.customFrom}
                  onChange={(event) => onChange({ ...filter, customFrom: event.target.value })}
                  className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-[13px] font-normal text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted">
                Sampai
                <input
                  type="date"
                  value={filter.customTo}
                  onChange={(event) => onChange({ ...filter, customTo: event.target.value })}
                  className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-[13px] font-normal text-ink outline-none focus:border-brand"
                />
              </label>
            </div>
          ) : null}

          <ChipToggle<TransactionType>
            label="Jenis"
            options={TRANSACTION_TYPE_ORDER.map((type) => ({ value: type, label: TRANSACTION_TYPE_LABELS[type] }))}
            selected={filter.types as TransactionType[]}
            onToggle={(value) => toggle("types", value as TransactionType)}
          />

          <ChipToggle<string>
            label="Kategori"
            options={ALL_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
            selected={filter.categoryIds}
            onToggle={(value) => toggle("categoryIds", value)}
          />

          <ChipToggle<string>
            label="Dompet"
            options={walletOptions}
            selected={filter.walletIds}
            onToggle={(value) => toggle("walletIds", value)}
          />

          <ChipToggle<string>
            label="Metode pembayaran"
            options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
            selected={filter.paymentMethods}
            onToggle={(value) => toggle("paymentMethods", value)}
          />

          <p className="text-[11.5px] text-muted">
            Pencarian mencakup catatan, nama kategori, dan nama dompet yang terlibat.
          </p>
        </Card>
      ) : null}

      {active > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          {filter.period !== "all" ? <Badge tone="brand">{PERIOD_LABEL[filter.period]}</Badge> : null}
          {filter.types.map((type) => (
            <Badge key={type} tone="neutral">
              {TRANSACTION_TYPE_LABELS[type as TransactionType]}
            </Badge>
          ))}
          {filter.categoryIds.map((id) => (
            <Badge key={id} tone="neutral">
              {categoryLabelMap().get(id) ?? id}
            </Badge>
          ))}
          {filter.walletIds.map((id) => (
            <Badge key={id} tone="neutral">
              {walletOptions.find((option) => option.value === id)?.label ?? id}
            </Badge>
          ))}
          <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-brand hover:underline">
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}

const TRANSACTION_TYPE_ORDER: TransactionType[] = [
  "income",
  "expense",
  "transfer",
  "savings_deposit",
  "savings_withdrawal",
  "opening_balance",
];

const PERIOD_LABEL: Record<string, string> = {
  thisMonth: "Bulan ini",
  lastMonth: "Bulan lalu",
  custom: "Rentang khusus",
  all: "Semua",
};
