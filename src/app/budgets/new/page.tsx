"use client";

import { PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { BudgetForm } from "@/app/forms/budget-form";
import { currentMonthKey } from "@/domain/selectors";
import { readQueryParam } from "@/lib/route-params";
import { isMonthKey } from "@/domain/calendar";

/** `/budgets/new` exists so the create flow works from links, empty states and the E2E suite. */
export default function NewBudgetPage() {
  const monthParam = readQueryParam("month");
  const categoryParam = readQueryParam("category");
  const defaultMonth = isMonthKey(monthParam) ? monthParam : currentMonthKey();

  return (
    <>
      <PageHeader
        title="Buat anggaran"
        subtitle="Batas pengeluaran untuk satu kategori dalam satu bulan."
        backHref="/budgets"
      />
      <HydrationGate>
        <BudgetForm
          mode="create"
          defaultMonth={defaultMonth}
          defaultCategory={categoryParam || undefined}
        />
      </HydrationGate>
    </>
  );
}
