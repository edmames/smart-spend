"use client";

import { currentMonthKey, shiftMonthKey, formatMonthLabel } from "@/domain/selectors";
import { isMonthKey } from "@/domain/calendar";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { amountOf, budgetFormSchema, type BudgetFormValues } from "@/app/forms/schemas";
import { FormAmount, FormSelect } from "@/app/forms/fields";
import { Button, Card } from "@/components/ui/layout";
import { useSmartSpendStore } from "@/app/store";
import { EXPENSE_CATEGORIES } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import { calculateCategorySpend } from "@/domain/selectors";
import type { Budget } from "@/domain/models";

/**
 * Budget form: `category + month + limit`, exactly one limit per category/month
 * (the store rejects duplicates before writing).
 */
export function BudgetForm({ mode, budget, defaultMonth }: { mode: "create" | "edit"; budget?: Budget; defaultMonth: string }) {
  const router = useRouter();
  const data = useSmartSpendStore((state) => state.data);
  const createBudget = useSmartSpendStore((state) => state.createBudget);
  const updateBudget = useSmartSpendStore((state) => state.updateBudget);

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      categoryId: budget?.categoryId ?? "",
      month: budget?.month ?? defaultMonth,
      limitAmount: budget?.limitAmount ?? null,
    },
  });

  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const month = useWatch({ control: form.control, name: "month" });
  const spent =
    typeof categoryId === "string" && typeof month === "string"
      ? calculateCategorySpend(data.transactions, categoryId, month)
      : 0;

  const submit = form.handleSubmit((values) => {
    const payload = {
      categoryId: typeof values.categoryId === "string" ? values.categoryId : "",
      month: values.month,
      limitAmount: amountOf(values.limitAmount),
    };
    const result = mode === "create" ? createBudget(payload) : updateBudget(budget?.id as string, payload);
    if (!result.ok) return;
    router.push(`/budgets?month=${payload.month}`);
  });

  const categoryOptions = EXPENSE_CATEGORIES.map((category) => ({ value: category.id, label: category.label }));

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Card as="section" className="flex flex-col gap-3">
        <FormSelect
          label="Kategori pengeluaran"
          control={form.control}
          name="categoryId"
          options={categoryOptions}
          placeholder="Pilih kategori"
          hint="Budget hanya menghitung pengeluaran nyata — transfer dan setoran tabungan diabaikan."
        />
        <FormSelect
          label="Bulan"
          control={form.control}
          name="month"
          options={monthOptions(month)}
          placeholder="Pilih bulan"
        />
        <FormAmount label="Batas budget" control={form.control} name="limitAmount" />

        <div className="rounded-xl bg-brand-soft/60 px-3 py-2 text-[13px] text-ink">
          <span className="text-muted">Pengeluaran tercatat bulan ini: </span>
          <strong className="tabular">{formatIDR(spent)}</strong>
        </div>
      </Card>

      <div className="sticky bottom-[calc(var(--nav-height)+0.75rem)] z-10 flex gap-2 pt-1">
        <Button variant="secondary" block onClick={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" block disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Simpan budget" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}

function monthOptions(selected: unknown): { value: string; label: string }[] {
  const base = currentMonthKey();
  const list: { value: string; label: string }[] = [];
  for (let offset = -6; offset <= 6; offset += 1) {
    const value = shiftMonthKey(base, offset);
    list.push({
      value,
      label: formatMonthLabel(value),
    });
  }
  if (typeof selected === "string" && isMonthKey(selected) && !list.some((option) => option.value === selected)) {
    list.unshift({ value: selected, label: selected });
  }
  return list;
}
