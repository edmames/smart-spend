"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { BudgetForm } from "@/app/forms/budget-form";
import { currentMonthKey } from "@/domain/selectors";

/** `/budgets/new` exists so the create flow works from links, empty states and the E2E suite. */
export default function NewBudgetPage() {
  const [monthKey] = useState(currentMonthKey());
  return (
    <>
      <PageHeader title="Budget baru" subtitle="Batas pengeluaran untuk satu kategori dalam satu bulan." backHref="/budgets" />
      <HydrationGate>
        <BudgetForm mode="create" defaultMonth={monthKey} />
      </HydrationGate>
    </>
  );
}
