"use client";

import type { ReactNode } from "react";
import { ShieldCheck, Sun, Moon, Monitor } from "lucide-react";
import { Card, PageHeader, SectionTitle } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { ExportCard, ImportCard, ResetCard } from "@/components/settings/data-cards";
import { useSmartSpendStore } from "@/app/store";
import { appVersion } from "@/app/version";
import { cn } from "@/lib/cn";
import { applyTheme } from "@/lib/theme";
import type { Theme, DefaultTransactionType } from "@/domain/models";

/**
 * `/settings` — Phase 2I Settings hub.
 *
 * Replaces the former "Lainnya" landing as the fifth primary tab. Preferences
 * persist immediately on change — there is no "Simpan perubahan" button.
 *
 * Structure (future-proofed for Phase 2J):
 *   PREFERENSI  — appearance + interaction defaults
 *   DATA        — backup & reset (unchanged behaviour)
 *   APLIKASI    — version + local-first explanation
 */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Preferensi, cadangan data, dan status aplikasi." backHref="/" />
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
  const updateSettings = useSmartSpendStore((state) => state.updateSettings);

  // Sync data-theme attribute whenever the theme preference changes.
  const settings = data.settings ?? {
    theme: "system" as Theme,
    firstTransactionType: "expense" as DefaultTransactionType,
  };
  applyTheme(settings.theme);

  const storageWorks = (() => {
    try {
      return typeof window !== "undefined" && !!window.localStorage;
    } catch {
      return false;
    }
  })();

  return (
    <>
      {/* ---- PREFERENSI ---- */}
      <SectionTitle>PREFERENSI</SectionTitle>

      <Card as="section" className="flex flex-col gap-3">
        <ThemePreference current={settings.theme} onChange={(next) => updateSettings({ theme: next })} />
        <TransactionTypePreference
          current={settings.firstTransactionType}
          onChange={(next) => updateSettings({ firstTransactionType: next })}
        />
      </Card>

      {/* ---- DATA ---- */}
      <SectionTitle>DATA</SectionTitle>

      <Card as="section">
        <div className="flex flex-col gap-1">
          <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">Cadangan &amp; pemulihan</h3>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Ekspor seluruh data ke file JSON, atau impor kembali dari cadangan yang pernah Anda unduh.
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-3">
          <ExportCard />
          <ImportCard />
        </div>
      </Card>

      <ResetCard />

      {/* ---- APLIKASI ---- */}
      <SectionTitle>APLIKASI</SectionTitle>
      <Card as="section" className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-ink">SmartSpend — {appVersion}</p>
            <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-ink/80">
              Aplikasi keuangan lokal. Semua data tersimpan di perangkat Anda; tidak ada akun, tidak ada server,
              tidak ada analitik apa pun. Perubahan langsung tersimpan di penyimpanan browser.
            </p>
          </div>
        </div>

        {!storageWorks ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-expense-soft px-3 py-2 text-[12px] text-expense">
            Browser ini menolak penyimpanan lokal (mode privat?). Aplikasi tetap bisa dipakai, tapi data hilang
            saat tab ditutup.
          </p>
        ) : null}
      </Card>
    </>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  {
    value: "system",
    label: "Sistem",
    icon: <Monitor className="h-4 w-4" aria-hidden />,
  },
  {
    value: "light",
    label: "Terang",
    icon: <Sun className="h-4 w-4" aria-hidden />,
  },
  {
    value: "dark",
    label: "Gelap",
    icon: <Moon className="h-4 w-4" aria-hidden />,
  },
];

function ThemePreference({ current, onChange }: { current: Theme; onChange: (value: Theme) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-muted">Tema tampilan</span>
      <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-1.5">
        {THEME_OPTIONS.map((option) => {
          const active = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-[13px] font-semibold transition",
                active
                  ? "border-brand bg-brand text-primary-foreground"
                  : "border-line bg-surface text-ink hover:border-brand/40 hover:bg-brand-soft/60",
              )}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted">Berubah dan tersimpan langsung.</p>
    </div>
  );
}

const TRANSACTION_TYPE_OPTIONS: { value: DefaultTransactionType; label: string }[] = [
  { value: "expense", label: "Pengeluaran" },
  { value: "income", label: "Pemasukan" },
];

function TransactionTypePreference({
  current,
  onChange,
}: {
  current: DefaultTransactionType;
  onChange: (value: DefaultTransactionType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-muted">Jenis transaksi awal</span>
      <div role="group" aria-label="Jenis transaksi awal" className="grid grid-cols-2 gap-1.5">
        {TRANSACTION_TYPE_OPTIONS.map((option) => {
          const active = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-xl border px-2 text-[13px] font-semibold transition",
                active
                  ? "border-brand bg-brand text-primary-foreground"
                  : "border-line bg-surface text-ink hover:border-brand/40 hover:bg-brand-soft/60",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted">Berubah dan tersimpan langsung.</p>
    </div>
  );
}