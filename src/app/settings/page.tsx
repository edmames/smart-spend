"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Database, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, PageHeader, SectionTitle } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { ExportCard, ImportCard, ResetCard } from "@/components/settings/data-cards";
import { useSmartSpendStore } from "@/app/store";
import { STORAGE_KEY } from "@/repository/storage-schema";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Penyimpanan, cadangan data, dan status aplikasi." backHref="/more" />
      <div className="flex flex-col gap-3">
        <HydrationGate>
          <SettingsBody />
        </HydrationGate>
      </div>
    </>
  );
}

function SettingsBody() {
  const data = useSmartSpendStore((state) => state.data);
  const lastSavedAt = useSmartSpendStore((state) => state.lastSavedAt);
  const reload = useSmartSpendStore((state) => state.reload);
  const [probe, setProbe] = useState<string | null>(null);

  const storageWorks = (() => {
    try {
      return typeof window !== "undefined" && !!window.localStorage;
    } catch {
      return false;
    }
  })();

  const counts = [
    { label: "Dompet", value: data.wallets.length },
    { label: "Transaksi", value: data.transactions.length },
    { label: "Tabungan", value: data.savingsTargets.length },
    { label: "Budget", value: data.budgets.length },
  ];

  return (
    <>
      <SectionTitle>Penyimpanan</SectionTitle>
      <Card as="section" className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-ink">Data lokal (perangkat ini)</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink/80">
              Data saat ini tersimpan di browser/perangkat ini dan belum tersinkron antarperangkat.
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-1 rounded-xl bg-canvas px-3 py-2 text-[12px] text-muted">
          <li className="flex items-center justify-between gap-2">
            <span>Status penyimpanan</span>
            <Badge tone={storageWorks ? "income" : "expense"}>{storageWorks ? "aktif" : "tidak tersedia"}</Badge>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Kunci penyimpanan</span>
            <code className="truncate text-[11.5px] text-ink">{STORAGE_KEY}</code>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Skema data</span>
            <span className="text-ink">v{data.version}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Terakhir disimpan</span>
            <span className="text-ink">
              {lastSavedAt ? new Date(lastSavedAt).toLocaleString("id-ID") : "belum ada perubahan"}
            </span>
          </li>
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void reload();
              setProbe("Data dibaca ulang dari penyimpanan browser.");
            }}
          >
            Cek ulang penyimpanan
          </Button>
          <Link
            href="/more"
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Menu lainnya
          </Link>
        </div>
        {probe ? <p className="text-[12px] font-medium text-income">{probe}</p> : null}

        {!storageWorks ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-expense-soft px-3 py-2 text-[12px] text-expense">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Browser ini menolak penyimpanan lokal (mode privat?). Aplikasi tetap bisa dipakai, tapi data hilang saat
            tab ditutup.
          </p>
        ) : null}
      </Card>

      <SectionTitle>Cadangan & pemulihan</SectionTitle>
      <ExportCard />
      <ImportCard />

      <SectionTitle>Zona berbahaya</SectionTitle>
      <ResetCard />

      <SectionTitle>Tentang</SectionTitle>
      <Card as="section" className="flex flex-col gap-1.5 text-[12.5px] text-muted">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-income" aria-hidden />
          SmartSpend — Phase 1
        </p>
        <p>
          Tidak ada akun, tidak ada server, tidak ada analitik. Semua perhitungan dilakukan di perangkat Anda;
          sinkronisasi awan (Supabase) baru datang di Phase 3.
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {counts.map((entry) => (
            <li key={entry.label} className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px]">
              {entry.label}: <strong className="text-ink">{entry.value}</strong>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
