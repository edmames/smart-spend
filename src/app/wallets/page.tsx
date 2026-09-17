"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import { WalletCard } from "@/components/wallets/wallet-card";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { calculateTotalMoney } from "@/domain/ledger";

export default function WalletsPage() {
  const [showArchived, setShowArchived] = useState(false);

  return (
    <>
      <PageHeader
        title="Dompet"
        subtitle="Semua saldo dihitung dari transaksi, tidak ada saldo yang diketik manual."
        actions={
          <LinkButton href="/wallets/new" size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Tambah
          </LinkButton>
        }
      />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          <WalletsContent showArchived={showArchived} onToggleArchived={() => setShowArchived((value) => !value)} />
        </HydrationGate>
      </div>
    </>
  );
}

function WalletsContent({ showArchived, onToggleArchived }: { showArchived: boolean; onToggleArchived: () => void }) {
  const data = useSmartSpendStore((state) => state.data);
  const active = data.wallets.filter((wallet) => wallet.archivedAt == null);
  const archived = data.wallets.filter((wallet) => wallet.archivedAt != null);
  const totals = calculateTotalMoney(data.wallets, data.savingsTargets, data.transactions);

  if (data.wallets.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-7 w-7" />}
        title="Belum ada dompet"
        description="Dompet adalah tempat uang berada: tunai, rekening bank, atau e-wallet. Transaksi yang butuh dompet sumber atau tujuan belum bisa dicatat sebelum ada dompet."
        action={
          <LinkButton href="/wallets/new" size="md">
            <Plus className="h-4 w-4" aria-hidden />
            Buat dompet pertama
          </LinkButton>
        }
      />
    );
  }

  return (
    <>
      <Card as="section" className="flex items-center justify-between gap-3 bg-brand-soft/60">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-brand-strong">Total uang di dompet</p>
          <p className="text-[22px] font-extrabold tabular text-ink">{formatIDR(totals.walletTotal)}</p>
          <p className="text-[11.5px] text-muted">
            Belum termasuk tabungan {formatIDR(totals.savingsTotal)} ·{" "}
            <Link href="/savings" className="font-semibold text-brand hover:underline">
              lihat tabungan
            </Link>
          </p>
        </div>
        <Badge tone="brand">{active.length} aktif</Badge>
      </Card>

      <SectionTitle
        action={
          archived.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={onToggleArchived}>
              {showArchived ? "Sembunyikan arsip" : `Tampilkan arsip (${archived.length})`}
            </Button>
          ) : null
        }
      >
        Dompet saya
      </SectionTitle>

      <ul className="flex flex-col gap-2">
        {active.map((wallet) => (
          <WalletCard key={wallet.id} wallet={wallet} />
        ))}
      </ul>

      {showArchived && archived.length > 0 ? (
        <>
          <SectionTitle>Arsip ({archived.length})</SectionTitle>
          <ul className="flex flex-col gap-2">
            {archived.map((wallet) => (
              <WalletCard key={wallet.id} wallet={wallet} />
            ))}
          </ul>
          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            Dompet terarsip tidak muncul di pilihan transaksi baru, tapi seluruh riwayatnya tetap dihitung dalam saldo
            dan laporan.
          </p>
        </>
      ) : null}

      {active.length === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">
          Semua dompet Anda sudah diarsipkan. Pulihkan salah satu untuk melanjutkan pencatatan.
        </p>
      ) : null}
    </>
  );
}
