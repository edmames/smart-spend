"use client";

import { PageHeader } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { SavingsTargetForm } from "@/app/forms/savings-forms";

export default function NewSavingsTargetPage() {
  return (
    <>
      <PageHeader
        title="Target tabungan baru"
        subtitle="Isi target & tenggat saja — saldo tabungan selalu hasil hitungan dari history."
        backHref="/savings"
      />
      <HydrationGate>
        <SavingsTargetForm mode="create" />
      </HydrationGate>
    </>
  );
}
