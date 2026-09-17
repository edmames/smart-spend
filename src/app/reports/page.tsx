"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { MonthPicker } from "@/components/summary/summary";
import { clampMonth, currentMonthKey, formatMonthLabel } from "@/app/forms/month";
import { useSmartSpendStore } from "@/app/store";
import { buildReportModel } from "@/app/reports-derived";
import {
  MonthlySummaryCard,
  ExpenseByCategoryCard,
  SixMonthTrendCard,
  BudgetVsActualCard,
  MoneyFlowCard,
} from "@/components/reports/report-cards";
import { Card, EmptyState, LinkButton } from "@/components/ui/layout";
import { Plus } from "lucide-react";

/**
 * `/reports` — Phase 2G mobile-first read-only reporting.
 * Derives exclusively from ledger, budgets, categories, wallets, savings.
 * All month grouping uses transaction.date, never createdAt.
 */
export default function ReportsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());

  return (
    <>
      <PageHeader title="Laporan" subtitle="Ringkasan dan analisis keuangan" backHref="/" />
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

  const report = useMemo(() => buildReportModel(data.transactions, data.budgets, monthKey), [
    data.transactions,
    data.budgets,
    monthKey,
  ]);

  const monthLabel = formatMonthLabel(monthKey);

  // Empty: no activity at all in selected month (no income, expense, transfer, savings)
  if (!report.hasAnyActivity) {
    return (
      <>
        <MonthPicker monthKey={monthKey} onChange={(next) => onChangeMonth(clampMonth(next))} allowFuture />
        <Card as="section" className="flex flex-col gap-3">
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

        {/* Still show trend and budget empty states for usefulness */}
        <SixMonthTrendCard trend={report.trend} monthKey={monthKey} />
        <BudgetVsActualCard usages={report.budgetUsages} monthKey={monthKey} monthLabel={monthLabel} categories={data.categories} />
        <MoneyFlowCard flow={report.moneyFlow} monthLabel={monthLabel} />
      </>
    );
  }

  return (
    <>
      <MonthPicker monthKey={monthKey} onChange={(next) => onChangeMonth(clampMonth(next))} allowFuture />

      <MonthlySummaryCard
        income={report.monthly.income}
        expense={report.monthly.expense}
        net={report.monthly.netCashFlow}
        monthLabel={monthLabel}
      />

      <ExpenseByCategoryCard entries={report.expenseByCategory} monthKey={monthKey} monthLabel={monthLabel} categories={data.categories} />

      <SixMonthTrendCard trend={report.trend} monthKey={monthKey} />

      <BudgetVsActualCard usages={report.budgetUsages} monthKey={monthKey} monthLabel={monthLabel} categories={data.categories} />

      <MoneyFlowCard flow={report.moneyFlow} monthLabel={monthLabel} />
    </>
  );
}
