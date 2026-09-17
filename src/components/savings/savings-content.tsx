"use client";

import { useState } from "react";
import Link from "next/link";
import { PiggyBank, Plus } from "lucide-react";
import { SavingsTargetCard } from "@/components/savings/savings-card";
import { Badge, Button, Card, EmptyState, LinkButton, SectionTitle } from "@/components/ui/layout";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateSavingsBalance } from "@/domain/ledger";
import { calculateSavingsProgress } from "@/domain/selectors";
import { useHideBalances, maskMoney } from "@/components/settings/money-mask";

export function SavingsContent() {
  const [showArchived, setShowArchived] = useState(false);
  const data = useSmartSpendStore((state) => state.data);
  const hideBalances = useHideBalances();
  const active = data.savingsTargets.filter((target) => target.archivedAt == null);
  const archived = data.savingsTargets.filter((target) => target.archivedAt != null);
  const totalSaved = active.reduce((sum, target) => sum + calculateSavingsBalance(data.transactions, target.id), 0);
  const reached = active.filter((target) => calculateSavingsProgress(target, data.transactions).goalReached).length;

  if (data.savingsTargets.length === 0) {
    return (
      <EmptyState
        icon={<PiggyBank className="h-7 w-7" />}
        title="Belum ada target tabungan"
        description="Buat target (mis. Dana Darurat), lalu setor dari dompet mana pun. Progres dihitung otomatis dari history."
        action={
          <LinkButton href="/savings/new">
            <Plus className="h-4 w-4" aria-hidden />
            Buat target pertama
          </LinkButton>
        }
      />
    );
  }

  return (
    <>
      <Card as="section" className="flex items-center justify-between gap-3 bg-savings-soft">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-savings">Total tersimpan (target aktif)</p>
          <p className="text-[22px] font-extrabold tabular text-ink">
            {hideBalances ? maskMoney() : formatIDR(totalSaved)}
          </p>
          <p className="text-[11.5px] text-muted">
            <Link href="/wallets" className="font-semibold text-brand hover:underline">
              Uang ini sudah diperhitungkan
            </Link>{" "}
            di Total Uang, tanpa dihitung ganda.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone="savings">{active.length} target</Badge>
          {reached > 0 ? <Badge tone="income">{reached} tercapai</Badge> : null}
        </div>
      </Card>

      <SectionTitle
        action={
          archived.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Sembunyikan arsip" : `Tampilkan arsip (${archived.length})`}
            </Button>
          ) : null
        }
      >
        Target saya
      </SectionTitle>

      <ul className="flex flex-col gap-2">
        {active.map((target) => (
          <SavingsTargetCard key={target.id} target={target} />
        ))}
      </ul>

      {active.length === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">Semua target sudah diarsipkan.</p>
      ) : null}

      {showArchived && archived.length > 0 ? (
        <>
          <SectionTitle>Arsip ({archived.length})</SectionTitle>
          <ul className="flex flex-col gap-2">
            {archived.map((target) => (
              <SavingsTargetCard key={target.id} target={target} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
