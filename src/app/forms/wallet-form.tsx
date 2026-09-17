"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Smartphone } from "lucide-react";
import { AmountInput, Field, Segmented, TextInput } from "@/components/ui/forms";
import { Button, Card, StickyActions } from "@/components/ui/layout";
import { amountOf, walletFormSchema, type WalletFormValues } from "@/app/forms/schemas";
import { formatIDR } from "@/domain/money";
import { WALLET_TYPES, WALLET_TYPE_LABELS, type Transaction, type Wallet, type WalletType } from "@/domain/models";
import { useSmartSpendStore } from "@/app/store";
import { calculateWalletBalance } from "@/domain/ledger";

/**
 * Wallet create/edit form.
 *
 * The "Saldo awal" field is *not* written to the wallet record: creating a wallet
 * with Rp1.000.000 inserts an `opening_balance` transaction, and editing it
 * rewrites that same ledger record. That is why the form prefills from the ledger
 * (derived), never from a stored balance.
 */

const TYPE_ICONS: Record<WalletType, typeof Banknote> = {
  cash: Banknote,
  bank: Building2,
  ewallet: Smartphone,
};

function openingBalanceOf(wallet: Wallet | undefined, transactions: readonly Transaction[]): number {
  if (!wallet) return 0;
  return transactions
    .filter((t) => t.type === "opening_balance" && t.destinationWalletId === wallet.id)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function WalletForm({ mode, wallet }: { mode: "create" | "edit"; wallet?: Wallet }) {
  const router = useRouter();
  const createWallet = useSmartSpendStore((state) => state.createWallet);
  const updateWallet = useSmartSpendStore((state) => state.updateWallet);
  const transactions = useSmartSpendStore((state) => state.data.transactions);

  const opening = openingBalanceOf(wallet, transactions);

  const form = useForm<WalletFormValues>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: {
      name: wallet?.name ?? "",
      type: wallet?.type ?? "bank",
      provider: wallet?.provider ?? "",
      openingBalance: mode === "edit" ? opening : 0,
    },
  });

  const submit = form.handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      type: values.type,
      provider: typeof values.provider === "string" && values.provider.trim() ? values.provider.trim() : null,
      openingBalance: amountOf(values.openingBalance) || 0,
    };

    const result =
      mode === "create" ? createWallet(payload) : updateWallet({ id: wallet?.id as string, ...payload });

    if (!result.ok) {
      // The domain's reason belongs on the form, not only in a toast that the user
      // may have already scrolled past.
      form.setError("root", { message: result.error.message, type: "validate" });
      return;
    }
    router.push(mode === "create" ? "/wallets" : `/wallets/${wallet?.id ?? ""}`);
  });

  const type = useWatch({ control: form.control, name: "type" });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Card as="section" className="flex flex-col gap-3">
        {form.formState.errors.root?.message ? (
          <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-[12.5px] font-semibold text-expense">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <Field label="Nama dompet" error={form.formState.errors.name?.message} htmlFor="wallet-name">
          <TextInput
            id="wallet-name"
            placeholder="cth: BCA, GoPay, Dompet"
            autoComplete="off"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register("name")}
          />
        </Field>

        <Segmented<WalletType>
          label="Tipe"
          value={type}
          onChange={(next) => form.setValue("type", next, { shouldValidate: true })}
          options={WALLET_TYPES.map((value) => {
            const Icon = TYPE_ICONS[value];
            return {
              value,
              label: WALLET_TYPE_LABELS[value],
              icon: <Icon className="h-4 w-4" />,
            };
          })}
        />

        <Field
          label="Penyedia"
          optional
          hint="Nama bank atau aplikasi — bebas, boleh tidak diisi."
          error={form.formState.errors.provider?.message}
          htmlFor="wallet-provider"
        >
          <TextInput
            id="wallet-provider"
            placeholder="cth: Bank Central Asia"
            autoComplete="off"
            {...form.register("provider")}
          />
        </Field>
      </Card>

      <Card as="section" className="flex flex-col gap-2">
        <Field
          label="Saldo awal"
          optional
          error={form.formState.errors.openingBalance?.message}
          htmlFor="wallet-opening"
          hint={
            mode === "create"
              ? "Dicatat sebagai transaksi “Saldo Awal”, sehingga ikut menghitung Total Uang tapi tidak dihitung sebagai pemasukan bulan ini."
              : "Mengubah nilai ini menulis ulang transaksi Saldo Awal dompet ini (riwayat akan divalidasi ulang)."
          }
        >
          <AmountInput control={form.control} name="openingBalance" id="wallet-opening" />
        </Field>
        <p className="text-[13px] text-muted">
          Saldo saat ini:{" "}
          <strong className="text-ink tabular">{formatIDR(balanceOf(wallet, transactions))}</strong>
        </p>
      </Card>

      <StickyActions>
        <Button variant="secondary" block onClick={() => router.back()} disabled={form.formState.isSubmitting}>
          Batal
        </Button>
        <Button type="submit" block disabled={form.formState.isSubmitting}>
          {mode === "create" ? "Simpan dompet" : "Simpan perubahan"}
        </Button>
      </StickyActions>
    </form>
  );
}

function balanceOf(wallet: Wallet | undefined, transactions: readonly Transaction[]): number {
  if (!wallet) return 0;
  return calculateWalletBalance(transactions, wallet.id);
}
