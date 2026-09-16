"use client";

import { formatCalendarDate } from "@/domain/calendar";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Card, ProgressBar } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { formatIDR } from "@/domain/money";
import type { SavingsTarget } from "@/domain/models";
import { useSmartSpendStore } from "@/app/store";
import { calculateSavingsProgress } from "@/domain/selectors";
import { useMemo } from "react";

/** Savings row: progress is always derived from the deposit/withdrawal ledger. */
export function SavingsTargetCard({ target }: { target: SavingsTarget }) {
  const transactions = useSmartSpendStore((state) => state.data.transactions);
  const progress = useMemo(() => calculateSavingsProgress(target, transactions), [target, transactions]);
  const archived = target.archivedAt != null;

  const deadline = target.deadline
    ? formatCalendarDate(target.deadline, "short")
    : null;

  return (
    <Card as="li" className="flex items-center gap-3 !p-3">
      <Link href={`/savings/${target.id}`} className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14.5px] font-bold text-ink">{target.name}</span>
            {archived ? <Badge tone="neutral">arsip</Badge> : null}
            {progress.goalReached && !archived ? <Badge tone="income">tercapai</Badge> : null}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-brand">
            detail
            <ChevronRight className="h-3 w-3" aria-hidden />
          </span>
        </span>

        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("text-[16px] font-extrabold tabular", archived ? "text-muted" : "text-ink")}>
            {formatIDR(progress.saved)}
          </span>
          <span className="shrink-0 text-[12px] tabular text-muted">dari {formatIDR(progress.targetAmount)}</span>
        </span>

        <ProgressBar
          percent={progress.percentCapped}
          tone={progress.goalReached ? "income" : "savings"}
          label={`Progres ${target.name}`}
        />

        <span className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
          <span>{progress.percentCapped.toFixed(0)}% · sisa {formatIDR(progress.remaining)}</span>
          {deadline ? <span>tenggat {deadline}</span> : null}
        </span>
      </Link>
    </Card>
  );
}
