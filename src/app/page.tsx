"use client";

import Link from "next/link";
import { ArrowRight, Database, PiggyBank, Plus, Receipt, Settings, Wallet, type LucideIcon } from "lucide-react";
import { Button, Card, LinkButton, ProgressBar, SectionTitle, SkeletonBlock } from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { CashFlowCard, TotalMoneyCard } from "@/components/summary/summary";
import { TransactionList } from "@/components/transactions/transaction-list";
import { useDerived } from "@/app/derived";
import { useSmartSpendStore } from "@/app/store";
import { formatIDR } from "@/domain/money";
import { sortTransactions } from "@/domain/ledger";

export default function DashboardPage() {
  return (
    <>
      <DashboardHeader />
      <div className="flex flex-col gap-3">
        <HydrationGate fallback={<DashboardSkeleton />}>
          <DashboardBody />
        </HydrationGate>
      </div>
    </>
  );
}

function DashboardHeader() {
  return (
    <header className="mb-2 flex min-h-11 items-center justify-between gap-2">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">SmartSpend</p>
        <h1 className="page-title text-ink">Ringkasan keuangan</h1>
      </div>
      <Link
        href="/settings"
        aria-label="Pengaturan"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-brand/40 hover:text-brand"
      >
        <Settings className="h-[18px] w-[18px]" aria-hidden />
      </Link>
    </header>
  );
}

function DashboardBody() {
  const derived = useDerived();
  const data = useSmartSpendStore((state) => state.data);

  if (derived.isEmpty) return <EmptyDashboard />;

  const recent = sortTransactions(data.transactions).slice(-4).reverse();
  const walletPreview = derived.walletRows.slice(0, 4);
  const savingsPreview = derived.savingsProgress.filter((progress) => progress.target.archivedAt == null).slice(0, 3);

  return (
    <>
      <TotalMoneyCard
        total={derived.totalMoney.total}
        walletTotal={derived.totalMoney.walletTotal}
        savingsTotal={derived.totalMoney.savingsTotal}
      />

      <QuickActions />

      <CashFlowCard summary={derived.monthly} />

      {walletPreview.length > 0 ? <WalletPreview rows={walletPreview} total={derived.totalMoney.walletTotal} /> : null}

      {savingsPreview.length > 0 ? <SavingsPreview items={savingsPreview} /> : null}

      <RecentTransactions items={recent} />

      <p className="px-1 text-center text-[11px] leading-relaxed text-muted">
        Data disimpan di browser/perangkat ini dan belum tersinkron antarperangkat.{" "}
        <Link href="/settings" className="font-semibold text-brand hover:underline">
          Ekspor cadangan
        </Link>
      </p>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat ringkasan keuangan...</span>
      <Card className="flex flex-col gap-3" aria-label="Memuat total uang">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-10" />
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
      </div>
      <Card className="flex flex-col gap-2.5">
        <SkeletonBlock className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      </Card>
    </div>
  );
}

function QuickActions() {
  return (
    <section aria-label="Aksi cepat" className="grid grid-cols-3 gap-2">
      <LinkButton href="/transactions/new" size="sm" variant="primary" className="min-h-11 gap-1.5">
        <Plus className="h-4 w-4" aria-hidden />
        Catat
      </LinkButton>
      <LinkButton href="/wallets" size="sm" variant="secondary" className="min-h-11 gap-1.5">
        <Wallet className="h-4 w-4" aria-hidden />
        Dompet
      </LinkButton>
      <LinkButton href="/savings" size="sm" variant="secondary" className="min-h-11 gap-1.5">
        <PiggyBank className="h-4 w-4" aria-hidden />
        Tabungan
      </LinkButton>
    </section>
  );
}

function WalletPreview({ rows, total }: { rows: ReturnType<typeof useDerived>["walletRows"]; total: number }) {
  return (
    <section aria-labelledby="wallet-preview-title" className="flex flex-col gap-2">
      <SectionTitle
        id="wallet-preview-title"
        action={
          <Link href="/wallets" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
            Semua dompet
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        }
      >
        Di mana uang Anda
      </SectionTitle>
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="text-[12px] font-semibold text-muted">Total dompet</span>
          <span className="text-[13.5px] font-bold tabular text-ink">{formatIDR(total)}</span>
        </div>
        <ul className="divide-y divide-line/70 px-3">
          {rows.map((row) => (
            <li key={row.wallet.id}>
              <Link href={`/wallets/${row.wallet.id}`} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{row.wallet.name}</span>
                <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{formatIDR(row.balance)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function SavingsPreview({ items }: { items: ReturnType<typeof useDerived>["savingsProgress"] }) {
  return (
    <section aria-labelledby="savings-preview-title" className="flex flex-col gap-2">
      <SectionTitle
        id="savings-preview-title"
        action={
          <Link href="/savings" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
            Kelola
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        }
      >
        Tabungan
      </SectionTitle>
      <Card padded={false} className="overflow-hidden px-3">
        <ul className="divide-y divide-line/70">
          {items.map((progress) => (
            <li key={progress.target.id}>
              <Link href={`/savings/${progress.target.id}`} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{progress.target.name}</span>
                  <span className="shrink-0 text-[13px] font-bold tabular text-ink">{formatIDR(progress.saved)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar
                    percent={progress.percentCapped}
                    tone={progress.goalReached ? "income" : "savings"}
                    className="h-1.5"
                    label={`Progres ${progress.target.name}`}
                  />
                  <span className="w-9 shrink-0 text-right text-[11px] tabular text-muted">
                    {progress.percentCapped.toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11.5px] text-muted">Target {formatIDR(progress.targetAmount)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function RecentTransactions({ items }: { items: ReturnType<typeof sortTransactions> }) {
  return (
    <section aria-labelledby="recent-transactions-title" className="flex flex-col gap-2">
      <SectionTitle
        id="recent-transactions-title"
        action={
          <Link href="/transactions" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
            Semua
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        }
      >
        Transaksi terakhir
      </SectionTitle>
      <TransactionList items={items} emptyTitle="Belum ada transaksi" dense />
    </section>
  );
}

function EmptyDashboard() {
  return (
    <Card as="section" className="flex flex-col gap-4 bg-brand-soft/55">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="card-title text-ink">Mulai dari dompet pertama</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/80">
            SmartSpend dimulai kosong. Buat dompet, lalu catat transaksi. Semua data tersimpan lokal di perangkat ini.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <EmptyStep icon={Wallet} text="Buat dompet tunai, bank, atau e-wallet." />
        <EmptyStep icon={Receipt} text="Catat pemasukan, pengeluaran, transfer, atau tabungan setelah dompet ada." />
        <EmptyStep icon={Database} text="Tidak ada data contoh dan tidak ada sinkronisasi otomatis." />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LinkButton href="/wallets/new">
          <Plus className="h-4 w-4" aria-hidden />
          Buat dompet
        </LinkButton>
        <Button variant="secondary" disabled className="justify-center">
          <Receipt className="h-4 w-4" aria-hidden />
          Catat transaksi
        </Button>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted">
        Catat transaksi aktif setelah ada dompet, supaya setiap transaksi punya sumber atau tujuan dana.
      </p>
    </Card>
  );
}

function EmptyStep({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink/80">
      <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
