"use client";

import { isMonthKey } from "@/domain/calendar";
import { currentMonthKey, formatMonthLabel, shiftMonthKey, calculateCategorySpend } from "@/domain/selectors";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { amountOf, budgetFormSchema, type BudgetFormValues } from "@/app/forms/schemas";
import { FormAmount, FormSelect } from "@/app/forms/fields";
import { Button, Card, StickyActions } from "@/components/ui/layout";
import { useSmartSpendStore } from "@/app/store";
import { activeCategoriesForType, categoriesForType } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import type { Budget } from "@/domain/models";

/**
 * Budget form: `category + month + limit`, exactly one limit per category/month
 * (the store rejects duplicates before writing).
 */
export function BudgetForm({
  mode,
  budget,
  defaultMonth,
  defaultCategory,
  actionsMode = "sticky",
  wrapCard = true,
  onCancel,
  onSuccess,
}: {
  mode: "create" | "edit";
  budget?: Budget;
  defaultMonth: string;
  defaultCategory?: string;
  actionsMode?: "sticky" | "inline";
  wrapCard?: boolean;
  onCancel?: () => void;
  onSuccess?: (budget: Budget) => void;
}) {
  const router = useRouter();
  const data = useSmartSpendStore((state) => state.data);
  const createBudget = useSmartSpendStore((state) => state.createBudget);
  const updateBudget = useSmartSpendStore((state) => state.updateBudget);

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      categoryId: budget?.categoryId ?? defaultCategory ?? "",
      month: budget?.month ?? defaultMonth,
      limitAmount: budget?.limitAmount ?? null,
    },
  });

  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const month = useWatch({ control: form.control, name: "month" }) || defaultMonth;
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
    if (!result.ok) {
      form.setError("root", { message: result.error.message, type: "validate" });
      return;
    }
    if (onSuccess && result.value) {
      onSuccess(result.value);
    } else {
      router.push(`/budgets?month=${payload.month}`);
    }
  });

  const existingInMonth = new Set(
    data.budgets
      .filter((b) => b.month === month && (mode === "create" || b.id !== budget?.id))
      .map((b) => b.categoryId),
  );

  const baseCategories = mode === "edit" && budget
    ? (() => {
        const active = activeCategoriesForType("expense", data.categories);
        const current = categoriesForType("expense", data.categories).find((category) => category.id === budget.categoryId);
        return current && !active.some((category) => category.id === current.id) ? [current, ...active] : active;
      })()
    : activeCategoriesForType("expense", data.categories);

  const categoryOptions = baseCategories.map((category) => {
    const alreadyExists = existingInMonth.has(category.id);
    return {
      value: category.id,
      label: `${alreadyExists ? `${category.label} (sudah ada)` : category.label}${category.archivedAt ? " (arsip)" : ""}`,
      disabled: alreadyExists || (mode === "create" && category.archivedAt != null),
    };
  });

  const formFields = (
    <>
      {form.formState.errors.root?.message ? (
        <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-[12.5px] font-semibold text-expense">
          {form.formState.errors.root.message}
        </p>
      ) : null}

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
        options={monthOptions(month, defaultMonth)}
        placeholder="Pilih bulan"
      />
      <FormAmount label="Batas anggaran" control={form.control} name="limitAmount" />

      <div className="rounded-xl bg-brand-soft/60 px-3 py-2 text-[13px] text-ink">
        <span className="text-muted">Pengeluaran tercatat pada {formatMonthLabel(month)}: </span>
        <strong className="tabular font-extrabold">{formatIDR(spent)}</strong>
      </div>
    </>
  );

  const inFlowActions = (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <Button
        variant="secondary"
        block
        type="button"
        onClick={() => (onCancel ? onCancel() : router.back())}
        disabled={form.formState.isSubmitting}
      >
        Batal
      </Button>
      <Button type="submit" block disabled={form.formState.isSubmitting}>
        {mode === "create" ? "Simpan anggaran" : "Simpan perubahan"}
      </Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {wrapCard ? (
        <Card as="section" className="flex flex-col gap-3">
          {formFields}
          {actionsMode === "inline" ? inFlowActions : null}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {formFields}
          {actionsMode === "inline" ? inFlowActions : null}
        </div>
      )}

      {actionsMode === "sticky" ? (
        <StickyActions>
          <Button
            variant="secondary"
            block
            type="button"
            onClick={() => (onCancel ? onCancel() : router.back())}
            disabled={form.formState.isSubmitting}
          >
            Batal
          </Button>
          <Button type="submit" block disabled={form.formState.isSubmitting}>
            {mode === "create" ? "Simpan anggaran" : "Simpan perubahan"}
          </Button>
        </StickyActions>
      ) : null}
    </form>
  );
}

function monthOptions(selected: unknown, baseMonth: string): { value: string; label: string }[] {
  const base = isMonthKey(baseMonth) ? baseMonth : currentMonthKey();
  const list: { value: string; label: string }[] = [];
  for (let offset = -6; offset <= 6; offset += 1) {
    const value = shiftMonthKey(base, offset);
    list.push({
      value,
      label: formatMonthLabel(value),
    });
  }
  if (typeof selected === "string" && isMonthKey(selected) && !list.some((option) => option.value === selected)) {
    list.unshift({ value: selected, label: formatMonthLabel(selected) });
  }
  return list;
}
