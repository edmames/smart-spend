"use client";

import Link from "next/link";
import { formatCalendarDate } from "@/domain/calendar";
import { ArrowLeftRight, Lightbulb, PiggyBank, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { categoryLabel, getCategoryIcon, getCategoryMeta } from "@/domain/categories";
import type { Transaction } from "@/domain/models";
import { TRANSACTION_TYPE_LABELS } from "@/domain/categories";
import { PAYMENT_METHOD_LABELS } from "@/domain/models";
import { formatIDR, formatSignedIDR } from "@/domain/money";
import { colorFor } from "@/components/ui/theme";
import { useSmartSpendStore } from "@/app/store";
import { useMemo } from "react";

/**
 * Ledger row presentation.
 *
 * Only labels and colours are computed here; the *amount* is shown exactly as it
 * is stored, with the sign taken from the transaction type — never from the raw
 * value and never recomputed.
 */

export interface DescribeContext {
  walletName: (id: string | null | undefined) => string;
  savingsName: (id: string | null | undefined) => string;
  categoryName?: (id: string | null | undefined) => string;
}

export function describeTransaction(transaction: Transaction, context: DescribeContext): string {
  switch (transaction.type) {
    case "income":
      return `Masuk ke ${context.walletName(transaction.destinationWalletId)}`;
    case "expense":
      return `${context.categoryName?.(transaction.categoryId) ?? categoryLabel(transaction.categoryId)} · ${context.walletName(transaction.sourceWalletId)}`;
    case "transfer":
      return `${context.walletName(transaction.sourceWalletId)} → ${context.walletName(transaction.destinationWalletId)}`;
    case "savings_deposit":
      return `${context.walletName(transaction.sourceWalletId)} → ${context.savingsName(transaction.savingsTargetId)}`;
    case "savings_withdrawal":
      return `${context.savingsName(transaction.savingsTargetId)} → ${context.walletName(transaction.destinationWalletId)}`;
    case "opening_balance":
      return `Saldo awal ${context.walletName(transaction.destinationWalletId)}`;
  }
}

export function transactionSignKind(transaction: Transaction): "income" | "expense" | "neutral" {
  if (transaction.type === "income" || transaction.type === "opening_balance") return "income";
  if (transaction.type === "expense") return "expense";
  return "neutral";
}

export function useDescribeContext(): DescribeContext {
  const data = useSmartSpendStore((state) => state.data);
  return useMemo(() => {
    const wallets = new Map(data.wallets.map((wallet) => [wallet.id, wallet.name]));
    const savings = new Map(data.savingsTargets.map((target) => [target.id, target.name]));
    return {
      walletName: (id) => (id ? (wallets.get(id) ?? "Dompet terhapus") : "—"),
      savingsName: (id) => (id ? (savings.get(id) ?? "Target terhapus") : "—"),
      categoryName: (id) => categoryLabel(id, "Tanpa kategori", data.categories),
    };
  }, [data.wallets, data.savingsTargets, data.categories]);
}

/** Icon resolution is a plain lookup (no component is created during render). */
export function TransactionIcon({ transaction, className }: { transaction: Transaction; className?: string }) {
  const categories = useSmartSpendStore((state) => state.data.categories);
  const Icon =
    transaction.type === "transfer"
      ? ArrowLeftRight
      : transaction.type === "savings_deposit" || transaction.type === "savings_withdrawal"
        ? PiggyBank
        : transaction.type === "opening_balance"
          ? Lightbulb
          : (getCategoryIcon(transaction.categoryId, categories) as LucideIcon);
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

export function TransactionRow({ transaction, href }: { transaction: Transaction; href?: string }) {
  const context = useDescribeContext();
  const categories = useSmartSpendStore((state) => state.data.categories);
  const meta = getCategoryMeta(transaction.categoryId, categories);
  const color = colorFor(
    transaction.type === "transfer"
      ? "indigo"
      : transaction.type === "savings_deposit" || transaction.type === "savings_withdrawal"
        ? "violet"
        : transaction.type === "opening_balance"
          ? "cyan"
          : meta?.color,
  );
  const kind = transactionSignKind(transaction);
  const typeTone = toneFor(transaction.type);
  const title =
    transaction.note && transaction.note.trim().length > 0
      ? transaction.note
      : meta?.label ?? TRANSACTION_TYPE_LABELS[transaction.type];
  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          color.soft,
          color.border,
        )}
      >
        <TransactionIcon transaction={transaction} className={cn("h-[18px] w-[18px]", color.text)} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{title}</span>
          <span
            className={cn(
              "shrink-0 text-[14px] font-bold tabular",
              kind === "income" && "text-income",
              kind === "expense" && "text-expense",
              kind === "neutral" && "text-ink",
            )}
          >
            {formatSignedIDR(transaction.amount, kind)}
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-muted">
          <Badge tone={typeTone} className="shrink-0">
            {TRANSACTION_TYPE_LABELS[transaction.type]}
          </Badge>
          <span className="truncate">{describeTransaction(transaction, context)}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular">{formatTransactionDate(transaction.date)}</span>
          {transaction.paymentMethod ? (
            <Badge tone="neutral" className="ml-auto">
              {PAYMENT_METHOD_LABELS[transaction.paymentMethod]}
            </Badge>
          ) : null}
        </span>
      </span>
    </>
  );

  const className =
    "flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition hover:bg-brand-soft/40 active:bg-brand-soft/60";

  if (href) {
    return (
      <li>
        <Link href={href} className={className}>
          {body}
        </Link>
      </li>
    );
  }
  return <li className={className}>{body}</li>;
}

export function formatTransactionDate(date: string): string {
  return formatCalendarDate(date, "short");
}

export function groupByDay(transactions: readonly Transaction[]): { key: string; label: string; total: number }[] {
  const groups = new Map<string, { key: string; label: string; total: number; items: Transaction[] }>();
  for (const transaction of transactions) {
    const key = transaction.date;
    const group = groups.get(key) ?? {
      key,
      label: formatCalendarDate(transaction.date),
      total: 0,
      items: [],
    };
    if (transaction.type === "income" || transaction.type === "expense") group.total += transaction.amount;
    group.items.push(transaction);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ key, label, total }) => ({ key, label, total }));
}

export function MoneyAmount({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn("tabular", className)}>{formatIDR(amount)}</span>;
}

function toneFor(type: Transaction["type"]): "income" | "expense" | "savings" | "brand" | "neutral" {
  if (type === "income" || type === "opening_balance") return "income";
  if (type === "expense") return "expense";
  if (type === "savings_deposit" || type === "savings_withdrawal") return "savings";
  if (type === "transfer") return "brand";
  return "neutral";
}
