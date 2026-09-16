"use client";

import { EmptyState, PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { WalletForm } from "@/app/forms/wallet-form";
import { useRouteId } from "@/lib/route-params";
import { useSmartSpendStore } from "@/app/store";

export default function EditWalletPage() {
  const id = useRouteId();
  return (
    <>
      <PageHeader title="Ubah dompet" backHref={`/wallets/${id}`} />
      <HydrationGate>
        <WalletEditor id={id} />
      </HydrationGate>
    </>
  );
}

function WalletEditor({ id }: { id: string }) {
  const wallet = useSmartSpendStore((state) => state.data.wallets.find((candidate) => candidate.id === id));
  if (!wallet) {
    return <EmptyState title="Dompet tidak ditemukan" description="Mungkin dihapus dari perangkat ini." />;
  }
  return <WalletForm mode="edit" wallet={wallet} />;
}
