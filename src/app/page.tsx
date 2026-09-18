"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  BarChart3,
  Database,
  Plus,
  Receipt,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ICON_SIZE,
  ICON_STROKE,
  LinkButton,
  ProgressBar,
  SectionTitle,
  SkeletonBlock,
} from "@/components/ui/layout";
import { HydrationGate } from "@/components/ui/hydration-gate";
import { CashFlowCard, TotalMoneyCard } from "@/components/summary/summary";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { useDerived } from "@/app/derived";
import { useSmartSpendStore } from "@/app/store";
import { categoryLabel } from "@/domain/categories";
import { formatIDR } from "@/domain/money";
import { WALLET_TYPE_LABELS } from "@/domain/models";
import { maskMoney, useHideBalances } from "@/components/settings/money-mask";
import type { CategoryBreakdownEntry } from "@/domain/selectors";
import { cn } from "@/lib/cn";

/**
 * Beranda — the Dashboard experience.
 *
 * It answers one question: "Gimana kondisi uang gue sekarang?" The read order is
 * deliberate and must stay this way — identity → total money → this month →
 * quick actions → Dompet & Tabungan → recent ledger → reports bridge.
 *
 * Every figure on this screen is derived (`useDerived` → domain selectors): the
 * ledger stays the single source of truth and nothing is cached or recomputed in
 * a component. Surfaces stay deliberately few — a section is separated from the
 * next one by whitespace and typography, not by wrapping it in another card.
 *
 * Motion comes from the shared primitives only (press feedback on controls,
 * colour transitions on rows). No entrance animation, no count-up, no stagger.
 */

/** Rows that open a financial record: full-bleed hover, colour-only motion.
 *  Variants are spelled out (no overrides) because `cn` is a plain joiner. */
const ROW_BASE =
  "flex w-full px-3 py-2.5 text-left transition-[background-color,color] duration-quick ease-standard hover:bg-elevated active:bg-elevated/80";
const ROW_LINK = `${ROW_BASE} items-center justify-between gap-3`;
const ROW_STACK = `${ROW_BASE} flex-col items-stretch gap-1.5`;
/** Trailing "n more" row — a link, but not a financial record. */
const ROW_MORE = `${ROW_BASE} items-center text-[12px] font-semibold text-brand`;

/** Contextual section/header link, used at the same weight everywhere. */
const SECTION_LINK = "text-[12px] font-semibold text-brand hover:underline";

export default function DashboardPage() {
  return (
    <>
      <DashboardHeader />
      <div className="flex flex-col gap-6">
        <HydrationGate fallback={<DashboardSkeleton />}>
          <DashboardBody />
        </HydrationGate>
      </div>
    </>
  );
}

/**
 * Lightweight identity header: no card, no invented user name, no clock — so it
 * can render before hydration without risking a wrong value.
 */
function DashboardHeader() {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">SmartSpend</p>
        <h1 className="page-title mt-0.5 text-ink">Kondisi uang Anda</h1>
        <p className="small-copy mt-1 text-muted">Semua angka dihitung dari catatan transaksi Anda.</p>
      </div>
      <Link
        href="/settings"
        aria-label="Pengaturan"
        className="motion-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-[transform,color,background-color] duration-instant ease-standard hover:bg-elevated hover:text-ink active:bg-elevated/70"
      >
        <Settings className={ICON_SIZE.md} aria-hidden strokeWidth={ICON_STROKE.ui} />
      </Link>
    </header>
  );
}

function DashboardBody() {
  const derived = useDerived();

  if (derived.isEmpty) return <EmptyDashboard />;

  const activeWallets = derived.walletRows.filter((row) => row.wallet.archivedAt == null);
  const activeSavings = derived.savingsProgress.filter((progress) => progress.target.archivedAt == null);
  const wallets = activeWallets.slice(0, 3);
  const savings = activeSavings.slice(0, 2);
  const recent = derived.transactionsDesc.slice(0, 4);

  return (
    <>
      <TotalMoneyCard
        total={derived.totalMoney.total}
        walletTotal={derived.totalMoney.walletTotal}
        savingsTotal={derived.totalMoney.savingsTotal}
      />

      <QuickActions />

      <CashFlowCard summary={derived.monthly} monthKey={derived.monthKey} />

      <MoneyHubSection
        wallets={wallets}
        savings={savings}
        moreWallets={activeWallets.length - wallets.length}
        moreSavings={activeSavings.length - savings.length}
      />

      <RecentTransactions items={recent} />

      <ReportsBridge topExpense={derived.expenseBreakdown[0]} />

      <p className="metadata px-1 text-center">
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
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat ringkasan keuangan...</span>

      <div className="flex flex-col gap-3 rounded-surface border border-line bg-surface px-4 pb-4 pt-4" aria-hidden>
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-10" />
          <SkeletonBlock className="h-10" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2" aria-hidden>
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
        <SkeletonBlock className="h-11" />
      </div>

      <div className="flex flex-col gap-2" aria-hidden>
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-16" />
      </div>

      <div className="flex flex-col gap-2" aria-hidden>
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-40" />
      </div>
    </div>
  );
}

/**
 * Four destinations, not four big cards. `Tambah Transaksi` is the only green
 * control on the screen — the rest stay secondary so the accent keeps meaning.
 */
function QuickActions() {
  return (
    <section aria-label="Aksi cepat" className="grid grid-cols-2 gap-2">
      <QuickAction href="/transactions/new" icon={Plus} label="Tambah Transaksi" variant="primary" />
      <QuickAction href="/transactions/new?kind=transfer" icon={ArrowLeftRight} label="Transfer" />
      <QuickAction href="/wallets" icon={Wallet} label="Kelola Dompet" />
      <QuickAction href="/reports" icon={BarChart3} label="Lihat Laporan" />
    </section>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  variant = "secondary",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <LinkButton href={href} variant={variant} size="sm" className="justify-start gap-2 px-3">
      <Icon className={ICON_SIZE.sm} aria-hidden strokeWidth={ICON_STROKE.ui} />
      <span className="truncate">{label}</span>
    </LinkButton>
  );
}

/**
 * The Money Hub in one section: two groups of interactive rows inside a single
 * surface (no card per wallet, no card per goal, no nested cards).
 *
 * Balances and progress are read straight from the derived state, and every
 * figure obeys the hide-balances preference.
 */
function MoneyHubSection({
  wallets,
  savings,
  moreWallets,
  moreSavings,
}: {
  wallets: ReturnType<typeof useDerived>["walletRows"];
  savings: ReturnType<typeof useDerived>["savingsProgress"];
  moreWallets: number;
  moreSavings: number;
}) {
  const hideBalances = useHideBalances();
  const money = (amount: number) => (hideBalances ? maskMoney() : formatIDR(amount));

  return (
    <section aria-labelledby="money-hub-title" className="flex flex-col gap-2">
      <SectionTitle
        id="money-hub-title"
        action={
          <Link href="/wallets" className={SECTION_LINK}>
            Kelola
          </Link>
        }
      >
        Dompet &amp; Tabungan
      </SectionTitle>

      <Card padded={false} className="overflow-hidden">
        <GroupHeader
          label="Dompet"
          actionHref={wallets.length > 0 ? "/wallets/new" : undefined}
          actionLabel="Tambah"
        />
        {wallets.length === 0 ? (
          <HubEmptyRow text="Belum ada dompet aktif." actionHref="/wallets/new" actionLabel="Buat dompet" />
        ) : (
          <ul className="divide-y divide-line/70">
            {wallets.map((row) => (
              <li key={row.wallet.id}>
                <Link href={`/wallets/${row.wallet.id}`} className={ROW_LINK}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{row.wallet.name}</span>
                    <span className="metadata truncate">{WALLET_TYPE_LABELS[row.wallet.type]}</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{money(row.balance)}</span>
                </Link>
              </li>
            ))}
            {moreWallets > 0 ? (
              <li>
                <Link href="/wallets" className={ROW_MORE}>
                  {moreWallets} dompet lain
                </Link>
              </li>
            ) : null}
          </ul>
        )}

        <GroupHeader
          label="Tabungan"
          actionHref={savings.length > 0 ? "/savings/new" : undefined}
          actionLabel="Target"
          className="border-t"
        />
        {savings.length === 0 ? (
          <HubEmptyRow text="Belum ada target tabungan." actionHref="/savings/new" actionLabel="Buat target" />
        ) : (
          <ul className="divide-y divide-line/70">
            {savings.map((progress) => (
              <li key={progress.target.id}>
                <Link href={`/savings/${progress.target.id}`} className={ROW_STACK}>
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{progress.target.name}</span>
                    <span className="shrink-0 text-[13px] font-bold tabular text-ink">{money(progress.saved)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ProgressBar
                      percent={progress.percentCapped}
                      tone={progress.goalReached ? "income" : "savings"}
                      className="h-1.5"
                      label={`Progres ${progress.target.name}`}
                    />
                    <span className="w-9 shrink-0 text-right text-[11px] tabular text-muted">
                      {progress.percentCapped.toFixed(0)}%
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="metadata">Target {money(progress.targetAmount)}</span>
                    {progress.goalReached ? <Badge tone="income">tercapai</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
            {moreSavings > 0 ? (
              <li>
                <Link href="/wallets?tab=savings" className={ROW_MORE}>
                  {moreSavings} target lain
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </Card>
    </section>
  );
}

function GroupHeader({
  label,
  actionHref,
  actionLabel,
  className,
}: {
  label: string;
  actionHref?: string;
  actionLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-line bg-elevated/50 px-3 py-1.5",
        className,
      )}
    >
      <span className="metadata font-bold uppercase tracking-wide">{label}</span>
      {actionHref ? (
        <Link href={actionHref} className={SECTION_LINK}>
          + {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function HubEmptyRow({ text, actionHref, actionLabel }: { text: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
      <span className="small-copy text-muted">{text}</span>
      <Link href={actionHref} className={SECTION_LINK}>
        + {actionLabel}
      </Link>
    </div>
  );
}

/** Recent ledger: the approved transaction row, in canonical order, nothing more. */
function RecentTransactions({ items }: { items: ReturnType<typeof useDerived>["transactionsDesc"] }) {
  return (
    <section aria-labelledby="recent-transactions-title" className="flex flex-col gap-2">
      <SectionTitle
        id="recent-transactions-title"
        action={
          <Link href="/transactions" className={SECTION_LINK}>
            Semua
          </Link>
        }
      >
        Transaksi terakhir
      </SectionTitle>

      {items.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <p className="small-copy text-muted">Belum ada transaksi yang dicatat.</p>
          <LinkButton href="/transactions/new" size="sm" variant="secondary">
            <Plus className={ICON_SIZE.sm} aria-hidden strokeWidth={ICON_STROKE.ui} />
            Catat transaksi
          </LinkButton>
        </Card>
      ) : (
        <Card as="section" padded={false} className="overflow-hidden px-1.5 py-1">
          <ul className="flex flex-col">
            {items.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} href={`/transactions/${transaction.id}`} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/**
 * Closing bridge to /reports. It states one derived fact (the largest expense
 * category of the current month) instead of inventing a trend or a percentage,
 * and falls back to neutral copy when there is nothing to summarise yet.
 */
function ReportsBridge({ topExpense }: { topExpense?: CategoryBreakdownEntry }) {
  const categories = useSmartSpendStore((state) => state.data.categories);
  const hideBalances = useHideBalances();

  return (
    <section aria-labelledby="reports-bridge-title" className="flex flex-col gap-1 px-0.5">
      <h2 id="reports-bridge-title" className="section-title text-muted">
        Pola pengeluaran
      </h2>
      <p className="small-copy text-muted">
        {topExpense ? (
          <>
            Pengeluaran terbesar bulan ini:{" "}
            <strong className="font-semibold text-ink">
              {categoryLabel(topExpense.categoryId, "Tanpa kategori", categories)}
            </strong>{" "}
            {hideBalances ? maskMoney() : formatIDR(topExpense.amount)}.{" "}
          </>
        ) : (
          "Belum ada pengeluaran bulan ini. "
        )}
        <Link href="/reports" className="font-semibold text-brand hover:underline">
          Buka laporan
        </Link>
      </p>
    </section>
  );
}

/**
 * First-run state: one surface, wallet first. A wallet is the prerequisite for
 * every transaction flow, so the primary action creates one and the ledger
 * action stays disabled until that is true.
 */
function EmptyDashboard() {
  return (
    <Card as="section" className="flex flex-col gap-4 bg-brand-soft/55">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
          <Wallet className={ICON_SIZE.md} aria-hidden strokeWidth={ICON_STROKE.ui} />
        </span>
        <div className="min-w-0">
          <h2 className="card-title text-ink">Mulai dari dompet pertama</h2>
          <p className="small-copy mt-1 text-muted">
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
          <Plus className={ICON_SIZE.sm} aria-hidden strokeWidth={ICON_STROKE.ui} />
          Buat dompet
        </LinkButton>
        <Button variant="secondary" disabled className="justify-center">
          <Receipt className={ICON_SIZE.sm} aria-hidden strokeWidth={ICON_STROKE.ui} />
          Catat transaksi
        </Button>
      </div>

      <p className="metadata">
        Catat transaksi aktif setelah ada dompet, supaya setiap transaksi punya sumber atau tujuan dana.
      </p>
    </Card>
  );
}

function EmptyStep({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("shrink-0 text-brand", ICON_SIZE.sm)} aria-hidden strokeWidth={ICON_STROKE.ui} />
      {/* `small-copy` is the foundation's dense-prose level (13px). */}
      <span className="small-copy text-muted">{text}</span>
    </div>
  );
}
