"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MoreHorizontal, PiggyBank, Plus, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * SmartSpend — primary navigation (exactly five items, per spec):
 *   Beranda · Transaksi · (+) · Dompet · Tabungan · Lainnya
 *
 * The centre action is a create shortcut, not a sixth tab: it routes to
 * /transactions/new. "Lainnya" is where Budget, Laporan and Pengaturan live.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Beranda", href: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  { label: "Transaksi", href: "/transactions", icon: Receipt, match: (p) => p.startsWith("/transactions") },
  { label: "Dompet", href: "/wallets", icon: Wallet, match: (p) => p.startsWith("/wallets") },
  { label: "Tabungan", href: "/savings", icon: PiggyBank, match: (p) => p.startsWith("/savings") },
  {
    label: "Lainnya",
    href: "/more",
    icon: MoreHorizontal,
    match: (p) => p.startsWith("/more") || p.startsWith("/budgets") || p.startsWith("/reports") || p.startsWith("/settings"),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/98 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-[43rem] grid-cols-5 items-stretch">
        {NAV_ITEMS.slice(0, 2).map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
        <div className="flex items-center justify-center">
          <Link
            href="/transactions/new"
            aria-label="Tambah transaksi"
            className="-mt-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-md transition active:scale-95"
          >
            <Plus className="h-6 w-6" strokeWidth={2.4} />
          </Link>
        </div>
        {NAV_ITEMS.slice(2).map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition",
        active ? "text-brand" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.3 : 1.9} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}
