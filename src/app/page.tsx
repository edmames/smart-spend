"use client";

import Link from "next/link";
import { ArrowRight, PiggyBank, Plus, Receipt, Wallet } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, SectionTitle } from "@/components/ui/layout";
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
        <HydrationGate>
          <DashboardBody />
        </HydrationGate>
      </div>
    </>
  );
}

function DashboardHeader() {
  return (
    <header className="mb-3 flex min-h-11 items-center justify-between gap-2">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand">SmartSpend</p>
        <h1 className="page-title text-ink">Ringkasan keuangan</h1>
      </div>
      <Link
        href="/settings"
        aria-label="Pengaturan"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 3.2v1.6M10 15.2v1.6M3.2 10h1.6M15.2 10h1.6M5.2 5.2l1.1 1.1M13.7 13.7l1.1 1.1M14.8 5.2l-1.1 1.1M6.3 13.7l-1.1 1.1" strokeLinecap="round" />
        </svg>
      </Link>
    </header>
  );
}

function DashboardBody() {
  const derived = useDerived();
  const data = useSmartSpendStore((state) => state.data);

  if (derived.isEmpty) {
    return (
      <>
        <Card as="section" className="flex flex-col gap-2 bg-brand-soft/50">
          <p className="text-[15px] font-bold text-ink">Mulai dari satu dompet</p>
          <p className="text-[13px] leading-relaxed text-ink/80">
            SmartSpend tidak berisi data contoh. Semua angka muncul dari transaksi yang Anda catat — dan semuanya
            tersimpan di perangkat ini saja.
          </p>
        </Card>

        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Belum ada yang dicatat"
          description="Buat dompet (tunai / bank / e-wallet), lalu catat pemasukan atau pengeluaran pertama Anda."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <LinkButton href="/wallets/new">
                <Plus className="h-4 w-4" aria-hidden />
                Buat dompet
              </LinkButton>
              <LinkButton href="/transactions/new" variant="secondary">
                <Receipt className="h-4 w-4" aria-hidden />
                Catat transaksi
              </LinkButton>
            </div>
          }
        />

        <OnboardingChecklist />
      </>
    );
  }

  const recent = sortTransactions(data.transactions).slice(-5).reverse();
  const overBudget = derived.budgetUsages.filter((usage) => usage.overBudget);

  return (
    <>
      <TotalMoneyCard
        total={derived.totalMoney.total}
        walletTotal={derived.totalMoney.walletTotal}
        savingsTotal={derived.totalMoney.savingsTotal}
      />

      <div className="grid grid-cols-3 gap-2">
        <LinkButton href="/transactions/new" size="sm" variant="primary" className="h-16 flex-col gap-1">
          <Plus className="h-4 w-4" aria-hidden />
          Catat
        </LinkButton>
        <LinkButton href="/wallets" size="sm" variant="secondary" className="h-16 flex-col gap-1">
          <Wallet className="h-4 w-4" aria-hidden />
          Dompet
        </LinkButton>
        <LinkButton href="/savings" size="sm" variant="secondary" className="h-16 flex-col gap-1">
          <PiggyBank className="h-4 w-4" aria-hidden />
          Tabungan
        </LinkButton>
      </div>

      <CashFlowCard summary={derived.monthly} />

      {derived.walletRows.length > 0 ? (
        <>
          <SectionTitle
            action={
              <Link href="/wallets" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
                Semua dompet
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            Dompet
          </SectionTitle>
          <Card as="section" padded={false} className="divide-y divide-line/70 px-3">
            {derived.walletRows.slice(0, 4).map((row) => (
              <Link key={row.wallet.id} href={`/wallets/${row.wallet.id}`} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{row.wallet.name}</span>
                  {row.wallet.archivedAt ? <Badge tone="neutral">arsip</Badge> : null}
                </span>
                <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{formatIDR(row.balance)}</span>
              </Link>
            ))}
          </Card>
        </>
      ) : null}

      {derived.savingsProgress.length > 0 ? (
        <>
          <SectionTitle
            action={
              <Link href="/savings" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
                Kelola
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            Tabungan
          </SectionTitle>
          <Card as="section" padded={false} className="divide-y divide-line/70 px-3">
            {derived.savingsProgress.slice(0, 3).map((progress) => (
              <Link
                key={progress.target.id}
                href={`/savings/${progress.target.id}`}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{progress.target.name}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-[13.5px] font-bold tabular text-ink">{formatIDR(progress.saved)}</span>
                  <span className="text-[11px] tabular text-muted">
                    {progress.percentCapped.toFixed(0)}%
                  </span>
                </span>
              </Link>
            ))}
          </Card>
        </>
      ) : null}

      {overBudget.length > 0 ? (
        <Card as="section" className="flex flex-col gap-1.5 border-expense/30 bg-expense-soft">
          <p className="text-[12.5px] font-bold text-expense">
            {overBudget.length} budget melewati batas bulan ini
          </p>
          {overBudget.slice(0, 3).map((usage) => (
            <p key={usage.budget.id} className="text-[12px] text-ink/80">
              {formatIDR(usage.spent)} / {formatIDR(usage.limit)}
            </p>
          ))}
          <Link href="/budgets" className="mt-1 text-[12px] font-semibold text-expense hover:underline">
            Lihat budget
          </Link>
        </Card>
      ) : null}

      <SectionTitle
        action={
          <Link href="/transactions" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand hover:underline">
            Semua
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        }
      >
        Transaksi terakhir
      </SectionTitle>
      <TransactionList items={recent} emptyTitle="Belum ada transaksi" />

      <p className="px-1 text-center text-[11px] leading-relaxed text-muted">
        Data disimpan di browser/perangkat ini dan belum tersinkron antarperangkat.{" "}
        <Link href="/settings" className="font-semibold text-brand hover:underline">
          Ekspor cadangan
        </Link>
      </p>
    </>
  );
}

function OnboardingChecklist() {
  const data = useSmartSpendStore((state) => state.data);
  const steps = [
    { label: "Buat minimal satu dompet", done: data.wallets.length > 0, href: "/wallets/new" },
    { label: "Catat pemasukan atau pengeluaran", done: data.transactions.length > 0, href: "/transactions/new" },
    { label: "Siapkan budget bulanan", done: data.budgets.length > 0, href: "/budgets" },
    { label: "Buat target tabungan", done: data.savingsTargets.length > 0, href: "/savings/new" },
  ];

  return (
    <Card as="section" className="flex flex-col gap-2">
      <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Langkah awal</p>
      <ul className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={
                  step.done
                    ? "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-income text-[10px] font-bold text-white"
                    : "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line"
                }
                aria-hidden
              >
                {step.done ? "✓" : ""}
              </span>
              <span className={step.done ? "truncate text-[13px] text-muted line-through" : "truncate text-[13px] font-medium text-ink"}>
                {step.label}
              </span>
            </span>
            {!step.done ? (
              <Link href={step.href} className="shrink-0 text-[12px] font-semibold text-brand hover:underline">
                buka
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
