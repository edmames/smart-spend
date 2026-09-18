"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  BarChart3,
  ChartPie,
  ChevronRight,
  Database,
  PiggyBank,
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
import { MonthlySummaryStrip, TotalMoneyCard } from "@/components/summary/summary";
import {
  TransactionIcon,
  describeTransaction,
  formatTransactionDate,
  useDescribeContext,
} from "@/components/transactions/transaction-row";
import { useDerived } from "@/app/derived";
import { useSmartSpendStore } from "@/app/store";
import { TRANSACTION_TYPE_LABELS, categoryLabel, getCategoryMeta } from "@/domain/categories";
import { formatIDR, formatSignedIDR } from "@/domain/money";
import { WALLET_TYPE_LABELS, type Transaction } from "@/domain/models";
import { maskMoney, useHideBalances } from "@/components/settings/money-mask";
import type { CategoryBreakdownEntry } from "@/domain/selectors";
import { cn } from "@/lib/cn";

/**
 * Beranda — the Dashboard experience.
 *
 * It answers one question: "Gimana kondisi uang gue sekarang?" The read order is
 * deliberate and must stay this way — identity → total money *with* this month →
 * quick actions → Dompet & Tabungan → recent ledger → reports bridge.
 *
 * Every figure on this screen is derived (`useDerived` → domain selectors): the
 * ledger stays the single source of truth and nothing is cached or recomputed in
 * a component. Surfaces are grouped on purpose (hero, money hub, recent feed,
 * reports bridge) but never nested and never one-card-per-metric.
 *
 * Motion comes from the shared primitives only (press feedback on controls,
 * colour transitions on rows). No entrance animation, no count-up, no stagger.
 */

/** Rows inside a grouped surface: colour-only feedback, never a card per row. */
const ROW =
  "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-[background-color] duration-quick ease-standard hover:bg-elevated/60 active:bg-elevated";
/** Trailing "n more" row — a link, but not a financial record. */
const ROW_MORE =
  "flex w-full items-center gap-3 px-3.5 py-2 text-[12px] font-semibold text-brand transition-[background-color] duration-quick ease-standard hover:bg-elevated/60 active:bg-elevated";
/** Soft circular icon treatment shared by money rows and the transaction feed.
 *  Size is always passed explicitly (`h-9 w-9` rows, `h-11 w-11` quick actions)
 *  because `cn` is a plain joiner — it never de-duplicates conflicting utilities. */
const ICON_CHIP = "inline-flex shrink-0 items-center justify-center rounded-full";
/** Contextual section link, used at the same weight everywhere. */
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
 * Identity header — auth-ready, not fake auth.
 *
 * V1 is local-first and has no account, so the greeting stays neutral: no
 * invented name, no avatar, no profile data. The layout already reserves the
 * identity block (greeting + supporting line) and the trailing control slot, so
 * Phase 3B can supply a display name/avatar inside `header` without redesigning
 * the Dashboard — and without a speculative abstraction existing today.
 */
function DashboardHeader() {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title text-ink">
          Selamat datang <span aria-hidden>👋</span>
        </h1>
        <p className="small-copy mt-1 text-muted">Ringkasan keuanganmu hari ini.</p>
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
      >
        <MonthlySummaryStrip summary={derived.monthly} monthKey={derived.monthKey} />
      </TotalMoneyCard>

      <QuickActions />

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

      <div className="total-money-hero overflow-hidden rounded-surface border" aria-hidden>
        <div className="px-4 pb-3 pt-4">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-3 h-9 w-52" />
          <SkeletonBlock className="mt-2 h-3 w-40" />
        </div>
        <div className="total-money-hero__month border-t px-4 pb-3.5 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-x-3">
            <SkeletonBlock className="h-8" />
            <SkeletonBlock className="h-8" />
            <SkeletonBlock className="h-8" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col items-center gap-1.5">
            <SkeletonBlock className="h-11 w-11 rounded-full" />
            <SkeletonBlock className="h-3 w-12" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2" aria-hidden>
        <SkeletonBlock className="h-4 w-40" />
        <div className="flex flex-col gap-3 rounded-surface border border-line bg-surface px-3.5 py-3">
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
        </div>
      </div>

      <div className="flex flex-col gap-2" aria-hidden>
        <SkeletonBlock className="h-4 w-32" />
        <div className="flex flex-col gap-3 rounded-surface border border-line bg-surface px-3.5 py-3">
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
        </div>
      </div>
    </div>
  );
}

/**
 * Four destinations, not four big cards: an icon-first row where `Tambah
 * Transaksi` is the only green control on the screen. The other three stay
 * restrained and neutral so the accent keeps meaning.
 */
function QuickActions() {
  return (
    <section aria-label="Aksi cepat" className="grid grid-cols-4 gap-2">
      <QuickAction href="/transactions/new" icon={Plus} label="Tambah Transaksi" primary />
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
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="motion-press group flex min-h-[4.5rem] min-w-0 flex-col items-center gap-1.5 rounded-control px-1 py-1.5 text-center transition-[background-color] duration-quick ease-standard hover:bg-elevated/50 active:bg-elevated"
    >
      <span
        className={cn(
          ICON_CHIP,
          "h-11 w-11 shrink-0 transition-[color,background-color,border-color] duration-quick ease-standard",
          primary
            ? "bg-primary text-primary-foreground"
            : "border border-line bg-surface text-muted group-hover:border-primary/45 group-hover:text-primary",
        )}
      >
        <Icon className={ICON_SIZE.md} aria-hidden strokeWidth={ICON_STROKE.ui} />
      </span>
      <span className={cn("w-full text-[11px] font-semibold leading-tight", primary ? "text-ink" : "text-muted group-hover:text-ink")}>
        {label}
      </span>
    </Link>
  );
}

/**
 * The Money Hub in one section: two labelled groups of interactive rows inside a
 * single structural surface (no card per wallet, no card per goal, no nested
 * cards), each row scanning icon → identity/metadata → balance/status → chevron.
 *
 * Balances and progress come straight from the derived state, and every figure
 * obeys the hide-balances preference.
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
            Kelola semua
          </Link>
        }
      >
        Dompet &amp; Tabungan
      </SectionTitle>

      <Card padded={false} className="overflow-hidden">
        <GroupLabel label="Dompet" actionHref={wallets.length > 0 ? "/wallets/new" : undefined} actionLabel="Tambah" />
        {wallets.length === 0 ? (
          <HubEmptyRow text="Belum ada dompet aktif." actionHref="/wallets/new" actionLabel="Buat dompet" />
        ) : (
          <ul className="divide-y divide-line/70">
            {wallets.map((row) => (
              <li key={row.wallet.id}>
                <Link href={`/wallets/${row.wallet.id}`} className={ROW}>
                  <span className={cn(ICON_CHIP, "h-9 w-9 bg-brand-soft text-brand-strong")}>
                    <Wallet className="h-[18px] w-[18px]" aria-hidden strokeWidth={ICON_STROKE.ui} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{row.wallet.name}</span>
                      <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{money(row.balance)}</span>
                    </span>
                    <span className="metadata truncate">{WALLET_TYPE_LABELS[row.wallet.type]}</span>
                  </span>
                  <ChevronRight className={cn(ICON_SIZE.sm, "shrink-0 text-subtle")} aria-hidden />
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

        <GroupLabel
          label="Tabungan"
          actionHref={savings.length > 0 ? "/savings/new" : undefined}
          actionLabel="Target"
          className="border-t border-line"
        />
        {savings.length === 0 ? (
          <HubEmptyRow text="Belum ada target tabungan." actionHref="/savings/new" actionLabel="Buat target" />
        ) : (
          <ul className="divide-y divide-line/70">
            {savings.map((progress) => (
              <li key={progress.target.id}>
                <Link href={`/savings/${progress.target.id}`} className={ROW}>
                  <span className={cn(ICON_CHIP, "h-9 w-9 bg-savings-soft text-savings")}>
                    <PiggyBank className="h-[18px] w-[18px]" aria-hidden strokeWidth={ICON_STROKE.ui} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{progress.target.name}</span>
                      <span className="shrink-0 text-[13.5px] font-bold tabular text-ink">{money(progress.saved)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <ProgressBar
                        percent={progress.percentCapped}
                        tone={progress.goalReached ? "income" : "savings"}
                        className="h-1.5"
                        label={`Progres ${progress.target.name}`}
                      />
                      <span className="w-8 shrink-0 text-right text-[11px] tabular text-muted">
                        {progress.percentCapped.toFixed(0)}%
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="metadata">Target {money(progress.targetAmount)}</span>
                      {progress.goalReached ? <Badge tone="income">tercapai</Badge> : null}
                    </span>
                  </span>
                  <ChevronRight className={cn(ICON_SIZE.sm, "shrink-0 text-subtle")} aria-hidden />
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

/** Group label inside the money-hub surface — typography, not another band. */
function GroupLabel({
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
    <div className={cn("flex items-center justify-between gap-2 px-3.5 pb-1 pt-3", className)}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">{label}</span>
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-3">
      <span className="small-copy text-muted">{text}</span>
      <Link href={actionHref} className={SECTION_LINK}>
        + {actionLabel}
      </Link>
    </div>
  );
}

/**
 * Recent ledger: the newest records in canonical order, presented the way the
 * Dashboard reads — icon, identity, metadata, amount.
 *
 * The feed is a Dashboard-owned presentation composed from the existing
 * transaction helpers (`TransactionIcon`, `describeTransaction`,
 * `formatTransactionDate`), so the Transactions screen keeps its own row design
 * and no financial logic is duplicated here.
 */
function RecentTransactions({ items }: { items: ReturnType<typeof useDerived>["transactionsDesc"] }) {
  return (
    <section aria-labelledby="recent-transactions-title" className="flex flex-col gap-2">
      <SectionTitle
        id="recent-transactions-title"
        action={
          <Link href="/transactions" className={SECTION_LINK}>
            Lihat semua
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
        <Card padded={false} className="overflow-hidden">
          <ul className="divide-y divide-line/70">
            {items.map((transaction) => (
              <DashboardTransactionRow key={transaction.id} transaction={transaction} href={`/transactions/${transaction.id}`} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/**
 * Icon treatment for the feed: semantic by transaction *type*, never the
 * categorical chart palette — the tint says what kind of movement the row is and
 * nothing more. Transfers, savings movements and opening balances therefore get
 * their own neutral/blue/violet chip and never an income or expense one.
 */
const FEED_TONES: Record<Transaction["type"], { chip: string; icon: string; badge: "income" | "expense" | "savings" | "brand" | "neutral" }> = {
  income: { chip: "bg-income-soft", icon: "text-income", badge: "income" },
  expense: { chip: "bg-expense-soft", icon: "text-expense", badge: "expense" },
  transfer: { chip: "bg-transfer-soft", icon: "text-transfer", badge: "brand" },
  savings_deposit: { chip: "bg-savings-soft", icon: "text-savings", badge: "savings" },
  savings_withdrawal: { chip: "bg-savings-soft", icon: "text-savings", badge: "savings" },
  opening_balance: { chip: "bg-elevated", icon: "text-muted", badge: "neutral" },
};

function DashboardTransactionRow({ transaction, href }: { transaction: Transaction; href: string }) {
  const context = useDescribeContext();
  const categories = useSmartSpendStore((state) => state.data.categories);
  const hideBalances = useHideBalances();
  const meta = getCategoryMeta(transaction.categoryId, categories);
  const tone = FEED_TONES[transaction.type];
  const title =
    transaction.note && transaction.note.trim().length > 0
      ? transaction.note
      : meta?.label ?? TRANSACTION_TYPE_LABELS[transaction.type];
  // Only a real income/expense is signed and toned. An internal movement or an
  // opening balance stays neutral ink (with its own type badge), so the feed
  // never presents it as income or expense.
  const amountKind: "income" | "expense" | "neutral" =
    transaction.type === "income" ? "income" : transaction.type === "expense" ? "expense" : "neutral";
  const amount = hideBalances ? maskMoney() : formatSignedIDR(transaction.amount, amountKind);

  return (
    <li>
      <Link href={href} className={ROW}>
        <span className={cn(ICON_CHIP, "h-9 w-9", tone.chip)}>
          <TransactionIcon transaction={transaction} className={cn("h-[18px] w-[18px]", tone.icon)} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink">{title}</span>
            <span
              className={cn(
                "shrink-0 text-[13.5px] font-bold tabular",
                amountKind === "income" && "text-income",
                amountKind === "expense" && "text-expense",
                amountKind === "neutral" && "text-ink",
              )}
            >
              {amount}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
            <Badge tone={tone.badge} className="shrink-0">
              {TRANSACTION_TYPE_LABELS[transaction.type]}
            </Badge>
            <span className="truncate">{describeTransaction(transaction, context)}</span>
            <span className="shrink-0" aria-hidden>
              ·
            </span>
            <span className="shrink-0 tabular">{formatTransactionDate(transaction.date)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Closing bridge to /reports.
 *
 * Deterministic by construction: it states one derived fact (the largest expense
 * category of the current month) and nothing else — no trend, no percentage, no
 * invented advice. The whole row is the link, so the chevron is an affordance
 * rather than a second target, and the amount respects the hide-balances
 * preference.
 */
function ReportsBridge({ topExpense }: { topExpense?: CategoryBreakdownEntry }) {
  const categories = useSmartSpendStore((state) => state.data.categories);
  const hideBalances = useHideBalances();

  return (
    <section aria-labelledby="reports-bridge-title">
      {/* Keeps the region's accessible name stable ("Pola pengeluaran") while the
          visible title states the user benefit, as the reference does. */}
      <h2 id="reports-bridge-title" className="sr-only">
        Pola pengeluaran
      </h2>
      <Link
        href="/reports"
        className="motion-press flex flex-col gap-2.5 rounded-surface border border-line bg-brand-soft/45 p-3.5 transition-[background-color,border-color] duration-quick ease-standard hover:border-primary/40 hover:bg-brand-soft/70 active:bg-brand-soft"
      >
        <span className="flex items-start gap-3">
          <span className={cn(ICON_CHIP, "h-9 w-9 bg-brand-soft text-brand-strong")}>
            <ChartPie className="h-[18px] w-[18px]" aria-hidden strokeWidth={ICON_STROKE.ui} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="card-title block text-ink">Lihat pola keuanganmu</span>
            <span className="small-copy mt-0.5 block text-muted">
              {topExpense ? (
                <>
                  Pengeluaran terbesar bulan ini:{" "}
                  <strong className="font-semibold text-ink">
                    {categoryLabel(topExpense.categoryId, "Tanpa kategori", categories)}
                  </strong>{" "}
                  {hideBalances ? maskMoney() : formatIDR(topExpense.amount)}.
                </>
              ) : (
                "Belum ada pengeluaran bulan ini."
              )}
            </span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 border-t border-line/70 pt-2 text-[12px] font-semibold text-brand">
          <span>Buka laporan</span>
          <ChevronRight className={ICON_SIZE.sm} aria-hidden />
        </span>
      </Link>
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
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground">
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
