"use client";

import Link from "next/link";
import { ArrowRight, Download, PiggyBank, Plus, Receipt, Settings, Wallet } from "lucide-react";
import { Badge, Card, LinkButton, PageHeader, SectionTitle } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { useDerived } from "@/app/derived";
import { formatIDR } from "@/domain/money";

/**
 * `/more` (\"Lainnya\") — the 5th primary tab.
 * Phase 2F: Dompet is Money Hub (Dompet | Tabungan), Budget is primary bottom nav.
 * Lainnya must NOT duplicate Budget or Tabungan as primary navigation destinations.
 * Only Laporan, Pengaturan, and contextual quick actions remain.
 */
export default function MorePage() {
  const derived = useDerived();

  return (
    <>
      <PageHeader title="Lainnya" subtitle="Laporan, pengaturan, dan aksi cepat." />

      <div className="flex flex-col gap-3">
        <HydrationGate>
          <SectionTitle>Utama</SectionTitle>
          <Card as="section" padded={false} className="divide-y divide-line/70 px-3">
            <MoreRow
              href="/reports"
              icon={<Receipt className="h-[18px] w-[18px]" aria-hidden />}
              label="Laporan"
              hint="Ringkasan bulanan & rincian kategori"
            />
            <MoreRow
              href="/settings"
              icon={<Settings className="h-[18px] w-[18px]" aria-hidden />}
              label="Pengaturan"
              hint="Penyimpanan, ekspor, impor, reset"
            />
          </Card>

          <SectionTitle>Pencatatan cepat</SectionTitle>
          <Card as="section" padded={false} className="divide-y divide-line/70 px-3">
            <MoreRow
              href="/transactions/new"
              icon={<Plus className="h-[18px] w-[18px]" aria-hidden />}
              label="Catat transaksi"
              hint="Masuk, keluar, transfer, tabungan"
            />
            <MoreRow
              href="/transactions"
              icon={<Receipt className="h-[18px] w-[18px]" aria-hidden />}
              label="Riwayat & filter"
              hint="Cari, saring per periode"
            >
              <Badge tone="neutral">{derived.counts.transactions}</Badge>
            </MoreRow>
            <MoreRow
              href="/wallets/new"
              icon={<Wallet className="h-[18px] w-[18px]" aria-hidden />}
              label="Tambah dompet"
              hint="Tunai, bank, atau e-wallet"
            />
            <MoreRow
              href="/savings/new"
              icon={<PiggyBank className="h-[18px] w-[18px]" aria-hidden />}
              label="Tambah target tabungan"
              hint="Setoran & penarikan tercatat"
            />
          </Card>

          <SectionTitle>Data</SectionTitle>
          <Card as="section" className="flex flex-col gap-2">
            <p className="text-[13px] leading-relaxed text-muted">
              Total uang <strong className="text-ink tabular">{formatIDR(derived.totalMoney.total)}</strong> — dihitung
              ulang otomatis dari {derived.counts.transactions} transaksi.
            </p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/settings" size="sm" variant="secondary">
                <Download className="h-4 w-4" aria-hidden />
                Ekspor / impor
              </LinkButton>
              <LinkButton href="/settings" size="sm" variant="ghost">
                Hapus semua data
              </LinkButton>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Data saat ini tersimpan di browser/perangkat ini dan belum tersinkron antarperangkat.
            </p>
          </Card>
        </HydrationGate>
      </div>
    </>
  );
}

function MoreRow({
  href,
  icon,
  label,
  hint,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas text-ink">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-bold text-ink">{label}</span>
        {hint ? <span className="truncate text-[11.5px] text-muted">{hint}</span> : null}
      </span>
      {children}
      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
