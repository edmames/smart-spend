"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { amountOf, savingsTargetFormSchema, transactionFormSchema, type SavingsTargetFormValues, type TransactionFormValues } from "@/app/forms/schemas";
import { FormAmount, FormDate, FormNote, FormSelect, FormText } from "@/app/forms/fields";
import { Button, Card } from "@/components/ui/layout";
import { useSmartSpendStore } from "@/app/store";
import { getTodayCalendarDate } from "@/domain/calendar";
import { formatIDR } from "@/domain/money";
import { calculateSavingsBalance, calculateWalletBalance } from "@/domain/ledger";
import type { SavingsTarget } from "@/domain/models";

/**
 * Savings target form (create / edit).
 *
 * Note there is no "current amount" field: progress is always derived from the
 * deposit/withdrawal ledger, so a user can never type a fake balance.
 */
export function SavingsTargetForm({ mode, target }: { mode: "create" | "edit"; target?: SavingsTarget }) {
  const router = useRouter();
  const createSavingsTarget = useSmartSpendStore((state) => state.createSavingsTarget);
  const updateSavingsTarget = useSmartSpendStore((state) => state.updateSavingsTarget);

  const form = useForm<SavingsTargetFormValues>({
    resolver: zodResolver(savingsTargetFormSchema),
    defaultValues: {
      name: target?.name ?? "",
      targetAmount: target?.targetAmount ?? null,
      deadline: target?.deadline ?? "",
      note: target?.note ?? "",
    },
  });

  const submit = form.handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      targetAmount: amountOf(values.targetAmount),
      deadline: typeof values.deadline === "string" && values.deadline ? values.deadline : null,
      note: typeof values.note === "string" && values.note.trim() ? values.note.trim() : null,
    };
    const result =
      mode === "create" ? createSavingsTarget(payload) : updateSavingsTarget(target?.id as string, payload);
    if (!result.ok) return;
    router.push(mode === "create" ? "/savings" : `/savings/${target?.id ?? ""}`);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Card as="section" className="flex flex-col gap-3">
        <FormText
          label="Nama target"
          control={form.control}
          name="name"
          optional={false}
          placeholder="cth: Dana Darurat"
        />
        <FormAmount
          label="Target nominal"
          control={form.control}
          name="targetAmount"
          hint="Uang yang ingin dikumpulkan. Menabung lebih dari target tetap boleh."
        />
        <FormText
          label="Tenggat"
          control={form.control}
          name="deadline"
          optional
          type="date"
          hint="Boleh dikosongkan."
        />
        <FormNote control={form.control} name="note" maxLength={200} />
      </Card>

      <div className="sticky bottom-[calc(var(--nav-height)+0.75rem)] z-10 flex gap-2 pt-1">
        <Button variant="secondary" block onClick={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" block disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Simpan target" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Deposit / withdraw form. Implemented on the *transaction* schema (kind-locked)
 * so savings movements go through the exact same validated pipeline as any other
 * ledger record — that is what keeps Total Money unchanged by construction.
 */
export function SavingsMovementForm({
  target,
  direction,
}: {
  target: SavingsTarget;
  direction: "deposit" | "withdrawal";
}) {
  const router = useRouter();
  const data = useSmartSpendStore((state) => state.data);
  const createTransaction = useSmartSpendStore((state) => state.createTransaction);

  const walletOptions = data.wallets
    .filter((wallet) => wallet.archivedAt == null)
    .map((wallet) => ({
      value: wallet.id,
      label: `${wallet.name} · ${formatIDR(calculateWalletBalance(data.transactions, wallet.id))}`,
    }));

  const saved = calculateSavingsBalance(data.transactions, target.id);
  const isDeposit = direction === "deposit";

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      kind: isDeposit ? "savings_deposit" : "savings_withdrawal",
      amount: null,
      categoryId: null,
      sourceWalletId: walletOptions.length === 1 && isDeposit ? walletOptions[0]?.value ?? "" : "",
      destinationWalletId: walletOptions.length === 1 && !isDeposit ? walletOptions[0]?.value ?? "" : "",
      savingsTargetId: target.id,
      date: getTodayCalendarDate(),
      paymentMethod: null,
      note: "",
    },
  });

  const submit = form.handleSubmit((values) => {
    const result = createTransaction({
      type: isDeposit ? "savings_deposit" : "savings_withdrawal",
      amount: amountOf(values.amount),
      date: values.date,
      savingsTargetId: target.id,
      sourceWalletId: isDeposit ? values.sourceWalletId || null : null,
      destinationWalletId: !isDeposit ? values.destinationWalletId || null : null,
      categoryId: null,
      paymentMethod: null,
      note: typeof values.note === "string" && values.note.trim() ? values.note.trim() : null,
    });
    if (!result.ok) return;
    router.push(`/savings/${target.id}`);
  });

  const chosenWallet = useWatch({
    control: form.control,
    name: isDeposit ? "sourceWalletId" : "destinationWalletId",
  });
  const available = isDeposit
    ? chosenWallet
      ? `Tersedia di dompet: ${formatIDR(calculateWalletBalance(data.transactions, chosenWallet as string))}`
      : "Pilih dompet sumber untuk melihat saldo tersedia."
    : `Saldo ${target.name}: ${formatIDR(saved)}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Card as="section" className="flex flex-col gap-3">
        <FormAmount
          label={isDeposit ? "Setor ke tabungan" : "Tarik dari tabungan"}
          control={form.control}
          name="amount"
          hint={available}
        />
        <FormSelect
          label={isDeposit ? "Dari dompet" : "Ke dompet"}
          control={form.control}
          name={isDeposit ? "sourceWalletId" : "destinationWalletId"}
          options={walletOptions}
          placeholder="Pilih dompet"
        />
        <FormDate control={form.control} name="date" />
        <FormNote control={form.control} name="note" />
      </Card>

      <p className="px-1 text-[12px] leading-relaxed text-muted">
        {isDeposit
          ? "Setoran memindahkan uang dari dompet ke tabungan. Total uang Anda tidak berubah dan ini tidak dihitung sebagai pengeluaran."
          : "Penarikan memindahkan uang dari tabungan ke dompet. Total uang Anda tidak berubah dan ini tidak dihitung sebagai pemasukan."}
      </p>

      <div className="sticky bottom-[calc(var(--nav-height)+0.75rem)] z-10 flex gap-2 pt-1">
        <Button variant="secondary" block onClick={() => router.push(`/savings/${target.id}`)}>
          Batal
        </Button>
        <Button type="submit" block disabled={form.formState.isSubmitting || walletOptions.length === 0}>
          {isDeposit ? "Setor sekarang" : "Tarik sekarang"}
        </Button>
      </div>
    </form>
  );
}
