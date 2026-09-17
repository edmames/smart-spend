"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  amountOf,
  transactionFormSchema,
  USER_TRANSACTION_FORM_KINDS,
  type TransactionFormKind,
  type TransactionFormValues,
} from "@/app/forms/schemas";
import { FormAmount, FormDate, FormNote, FormPaymentMethod, FormSelect } from "@/app/forms/fields";
import { Segmented } from "@/components/ui/forms";
import { Badge, Button, Card, StickyActions } from "@/components/ui/layout";
import { ALL_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/domain/categories";
import type { SelectOption } from "@/components/ui/forms";
import { useSmartSpendStore } from "@/app/store";
import { getTodayCalendarDate } from "@/domain/calendar";
import { formatIDR } from "@/domain/money";
import { calculateSavingsBalance, calculateWalletBalance } from "@/domain/ledger";
import type { Transaction, TransactionType } from "@/domain/models";

/**
 * SmartSpend — the transaction form (create + edit).
 *
 * One form drives all five user-facing kinds plus "Saldo Awal" edits, because the
 * *shape* differs only in which references are legal. `superRefine` in the schema
 * enforces that shape; the domain then re-checks references, archiving and
 * available balance before the store writes anything.
 */

const KIND_LABELS: Record<TransactionFormKind, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer: "Transfer",
  savings_deposit: "Setor tabungan",
  savings_withdrawal: "Tarik tabungan",
  opening_balance: "Saldo awal",
};

const KIND_SHORT_LABELS: Record<TransactionFormKind, string> = {
  income: "Masuk",
  expense: "Keluar",
  transfer: "Transfer",
  savings_deposit: "Setor",
  savings_withdrawal: "Tarik",
  opening_balance: "Saldo awal",
};

const KIND_TO_TYPE: Record<TransactionFormKind, TransactionType> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
  savings_deposit: "savings_deposit",
  savings_withdrawal: "savings_withdrawal",
  opening_balance: "opening_balance",
};

const TYPE_TO_KIND: Record<TransactionType, TransactionFormKind> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
  savings_deposit: "savings_deposit",
  savings_withdrawal: "savings_withdrawal",
  opening_balance: "opening_balance",
};

export type TransactionFormMode = "create" | "edit";

export function TransactionForm({
  mode,
  initialKind = "expense",
  transaction,
  lockKind = false,
  fixedSavingsTargetId,
  fixedSourceWalletId,
  onCancel,
}: {
  mode: TransactionFormMode;
  initialKind?: TransactionFormKind;
  transaction?: Transaction;
  lockKind?: boolean;
  fixedSavingsTargetId?: string;
  /** Presets "from wallet" when arriving from a wallet screen (still editable). */
  fixedSourceWalletId?: string;
  /**
   * Abandoning without saving. An edit screen owns a read-only view to return to, so
   * it passes a handler that drops the draft form; creating a record has nowhere to
   * return to, so "Batal" falls back to history.
   */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const data = useSmartSpendStore((state) => state.data);
  const createTransaction = useSmartSpendStore((state) => state.createTransaction);
  const updateTransaction = useSmartSpendStore((state) => state.updateTransaction);

  const kind = transaction ? TYPE_TO_KIND[transaction.type] : initialKind;

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      kind: kind as TransactionFormKind,
      amount: transaction?.amount ?? null,
      categoryId: transaction?.categoryId ?? "",
      sourceWalletId: transaction?.sourceWalletId ?? (fixedSourceWalletId && initialKind !== "income" ? fixedSourceWalletId : ""),
      destinationWalletId: transaction?.destinationWalletId ?? "",
      savingsTargetId: transaction?.savingsTargetId ?? fixedSavingsTargetId ?? "",
      date: transaction?.date ?? getTodayCalendarDate(),
      paymentMethod: transaction?.paymentMethod ?? null,
      note: transaction?.note ?? "",
    },
  });

  const selectedKind = (useWatch({ control: form.control, name: "kind" }) ?? kind) as TransactionFormKind | "opening_balance";
  const sourceWalletId = useWatch({ control: form.control, name: "sourceWalletId" });
  const savingsTargetId = useWatch({ control: form.control, name: "savingsTargetId" });
  const showCategory = selectedKind === "income" || selectedKind === "expense";
  const showSourceWallet = selectedKind !== "income" && selectedKind !== "opening_balance" && selectedKind !== "savings_withdrawal";
  const showDestinationWallet =
    selectedKind === "income" ||
    selectedKind === "transfer" ||
    selectedKind === "savings_withdrawal" ||
    selectedKind === "opening_balance";
  const showSavingsTarget = selectedKind === "savings_deposit" || selectedKind === "savings_withdrawal";
  const showPaymentMethod = selectedKind === "income" || selectedKind === "expense";

  const walletOptions = buildWalletOptions(data.wallets, data.transactions);
  const savingsOptions = data.savingsTargets
    .filter((target) => target.archivedAt == null)
    .map((target) => ({ value: target.id, label: target.name }));
  const categoryOptions = (selectedKind === "income"
    ? INCOME_CATEGORIES
    : selectedKind === "expense"
      ? EXPENSE_CATEGORIES
      : ALL_CATEGORIES
  ).map((category) => ({ value: category.id, label: category.label }));

  // "Tersedia" is the *derived* balance, so the user sees exactly what the
  // domain is about to validate the outflow against.
  const availableHint = (() => {
    if (!showSourceWallet) {
      if (selectedKind === "savings_withdrawal") {
        const target = data.savingsTargets.find((candidate) => candidate.id === savingsTargetId);
        if (!target) return undefined;
        return `Saldo ${target.name}: ${formatIDR(calculateSavingsBalance(data.transactions, target.id))}`;
      }
      return undefined;
    }
    const wallet = data.wallets.find((candidate) => candidate.id === sourceWalletId);
    if (!wallet) return undefined;
    return `Tersedia di ${wallet.name}: ${formatIDR(calculateWalletBalance(data.transactions, wallet.id))}`;
  })();

  const submit = form.handleSubmit((values) => {
    const payload = {
      amount: amountOf(values.amount),
      date: values.date,
      note: values.note || null,
      paymentMethod: showPaymentMethod ? (values.paymentMethod ?? null) : null,
      categoryId: showCategory ? normalise(values.categoryId) : null,
      sourceWalletId: showSourceWallet ? normalise(values.sourceWalletId) : null,
      destinationWalletId: showDestinationWallet ? normalise(values.destinationWalletId) : null,
      savingsTargetId: showSavingsTarget ? normalise(values.savingsTargetId) : null,
      type: KIND_TO_TYPE[selectedKind],
    };

    const result = mode === "create" ? createTransaction(payload) : updateTransaction(transaction?.id as string, payload);
    if (!result.ok) {
      // The domain already explained *which* field is wrong; put that explanation
      // on the field itself (a toast alone would leave the form looking untouched).
      const fields = result.error.fields ?? {};
      for (const [name, message] of Object.entries(fields)) {
        if (name === "wallet") {
          // the domain reports one "wallet" field; the form has two of them
          const target = showSourceWallet ? "sourceWalletId" : "destinationWalletId";
          form.setError(target, { message, type: "validate" });
        } else if (name in payload) {
          form.setError(name as Exclude<keyof typeof payload, "type">, { message, type: "validate" });
        }
      }
      form.setError("root", { message: result.error.message, type: "validate" });
      return;
    }
    router.push(mode === "create" ? "/transactions" : `/transactions/${transaction?.id ?? ""}`);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {!lockKind ? (
        <Card as="section" className="flex flex-col gap-2.5">
          {/*
            One card for the picker *and* what the chosen type means. The five kinds wrap
            3 + 2 instead of 2 + 2 + 1, so the block is a row shorter and Nominal sits
            that much higher on the phone.
          */}
          <Segmented<TransactionFormKind>
            label="Jenis transaksi"
            value={selectedKind as TransactionFormKind}
            columns={3}
            onChange={(next) => {
              form.setValue("kind", next, { shouldValidate: false });
              // References that cannot exist on the new kind are cleared so a
              // previously chosen value can never leak into another transaction type.
              if (next !== "income" && next !== "expense") form.setValue("categoryId", "");
              if (next === "income" || next === "savings_withdrawal") form.setValue("sourceWalletId", "");
              if (next === "expense" || next === "transfer" || next === "savings_deposit") form.setValue("destinationWalletId", "");
              if (next !== "savings_deposit" && next !== "savings_withdrawal") form.setValue("savingsTargetId", fixedSavingsTargetId ?? "");
              if (next !== "income" && next !== "expense") form.setValue("paymentMethod", null);
            }}
            options={USER_TRANSACTION_FORM_KINDS.map((value) => ({ value, label: KIND_SHORT_LABELS[value] }))}
          />
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] leading-relaxed text-muted">{KIND_NOTES[selectedKind]}</p>
            <Badge tone={toneForKind(selectedKind)} className="shrink-0">
              {MOVEMENT_LABELS[selectedKind]}
            </Badge>
          </div>
        </Card>
      ) : (
        <Card as="section" className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-muted">Jenis transaksi</span>
          <span className="rounded-full bg-brand-soft px-3 py-1 text-[13px] font-bold text-brand-strong">
            {KIND_LABELS[selectedKind]}
          </span>
        </Card>
      )}

      <Card as="section" className="flex flex-col gap-3">
        {form.formState.errors.root?.message ? (
          <p className="rounded-lg bg-expense-soft px-3 py-2 text-[12.5px] font-semibold text-expense">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <FormAmount control={form.control} name="amount" hint={availableHint} />

        {showCategory ? (
          <FormSelect
            label="Kategori"
            control={form.control}
            name="categoryId"
            options={categoryOptions}
            placeholder="Pilih kategori"
          />
        ) : null}

        {showSourceWallet ? (
          <FormSelect
            label="Dari dompet"
            control={form.control}
            name="sourceWalletId"
            options={walletOptions}
            placeholder="Pilih dompet"
          />
        ) : null}

        {showDestinationWallet ? (
          <FormSelect
            label={selectedKind === "income" ? "Ke dompet" : selectedKind === "opening_balance" ? "Dompet" : "Ke dompet"}
            control={form.control}
            name="destinationWalletId"
            options={walletOptions}
            placeholder="Pilih dompet"
          />
        ) : null}

        {showSavingsTarget ? (
          <FormSelect
            label="Target tabungan"
            control={form.control}
            name="savingsTargetId"
            options={savingsOptions}
            placeholder="Pilih target"
          />
        ) : null}

        <FormDate control={form.control} name="date" />

        {showPaymentMethod ? <FormPaymentMethod control={form.control} /> : null}

        <FormNote control={form.control} label="Deskripsi" placeholder="cth: makan siang, gaji, kirim ke Cash" />
      </Card>

      {/*
        Batal never saves: in edit mode it asks the detail screen to drop the draft (the
        header's "Tutup" is the same exit, for when the user is near the top of the
        form), and in create mode it leaves the page the way the user arrived.
      */}
      <StickyActions>
        <Button
          variant="secondary"
          block
          onClick={() => (onCancel ? onCancel() : router.back())}
          disabled={form.formState.isSubmitting}
        >
          Batal
        </Button>
        <Button type="submit" block disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Simpan transaksi" : "Simpan perubahan"}
        </Button>
      </StickyActions>
    </form>
  );
}

const KIND_NOTES: Record<TransactionFormKind, string> = {
  income: "Pemasukan menambah uang total dan dihitung sebagai pemasukan bulan ini.",
  expense: "Pengeluaran mengurangi uang total dan dihitung sebagai pengeluaran bulan ini.",
  transfer: "Transfer hanya memindahkan uang antar dompet: saldo berubah, total uang tetap.",
  savings_deposit: "Setoran memindahkan uang ke tabungan — ini bukan pengeluaran.",
  savings_withdrawal: "Penarikan memindahkan uang ke dompet — ini bukan pemasukan.",
  opening_balance: "Saldo awal menambah uang total tapi tidak dihitung sebagai pemasukan bulanan.",
};

const MOVEMENT_LABELS: Record<TransactionFormKind, string> = {
  income: "Uang masuk",
  expense: "Uang keluar",
  transfer: "Internal",
  savings_deposit: "Internal",
  savings_withdrawal: "Internal",
  opening_balance: "Saldo awal",
};

function toneForKind(kind: TransactionFormKind): "income" | "expense" | "savings" | "brand" | "neutral" {
  if (kind === "income" || kind === "opening_balance") return "income";
  if (kind === "expense") return "expense";
  if (kind === "savings_deposit" || kind === "savings_withdrawal") return "savings";
  if (kind === "transfer") return "brand";
  return "neutral";
}

function normalise(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildWalletOptions(
  wallets: readonly { id: string; name: string; archivedAt?: string | null }[],
  transactions: readonly Transaction[],
): SelectOption[] {
  return wallets.map((wallet) => ({
    value: wallet.id,
    label: `${wallet.name} · ${formatIDR(calculateWalletBalance(transactions, wallet.id))}${wallet.archivedAt ? " (arsip)" : ""}`,
    disabled: wallet.archivedAt != null,
  }));
}
