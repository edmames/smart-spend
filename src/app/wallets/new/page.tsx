"use client";

import { PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { WalletForm } from "@/app/forms/wallet-form";

export default function NewWalletPage() {
  return (
    <>
      <PageHeader
        title="Dompet baru"
        subtitle="Saldo awal dicatat sebagai transaksi, bukan kolom saldo yang bisa diedit bebas."
        backHref="/wallets"
      />
      <HydrationGate>
        <WalletForm mode="create" />
      </HydrationGate>
    </>
  );
}
