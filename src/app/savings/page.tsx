"use client";

import { MoneyHub } from "@/components/money-hub/money-hub";
import { HydrationGate } from "@/components/ui/hydration-gate";

export default function SavingsPage() {
  return (
    <HydrationGate>
      <MoneyHub initialTab="savings" />
    </HydrationGate>
  );
}
